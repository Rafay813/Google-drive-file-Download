const { getDriveFileStream, getDriveFileMetadata } = require('../services/gDrive.js')
const { getDirectFileMetadata, getDirectFileStream, getMediaFireStream } = require('../services/directService.js')
const { uploadToGofile } = require('../services/gofileService.js')
const { uploadToPixelDrain } = require('../services/pixeldrainService.js')
const { detectSource } = require('../utils/detectSource.js')
const { createError } = require('../utils/errorHandler.js')
const validateFile = require('../utils/validateFile.js')
const { PassThrough } = require('stream')
const Transfer = require('../models/Transfer.js')

// ─── SSE Helper ──────────────────────────────────────────────────
const sendEvent = (res, event, data) => {
  if (!res.writableEnded) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
}

// ─── Stream Cleanup ──────────────────────────────────────────────
const destroyStreams = (...streams) => {
  for (const s of streams) {
    try { if (s && !s.destroyed) s.destroy() } catch (_) {}
  }
  if (global.gc) global.gc()
  console.log('🧹 Streams destroyed — RAM freed')
}

// ─── Upload with ECONNRESET retry ────────────────────────────────
// ECONNRESET means the connection to Gofile/PixelDrain dropped mid-upload.
// We retry once with a fresh stream slice — enough to recover from
// a temporary network hiccup without hammering the service.
const uploadWithRetry = async (uploadFn, stream, filename, mimeType, serviceName) => {
  try {
    return await uploadFn(stream, filename, mimeType)
  } catch (err) {
    if (err.message?.includes('ECONNRESET') || err.message?.includes('ETIMEDOUT')) {
      console.warn(`⚠️  ${serviceName} ECONNRESET — retrying once...`)
      await new Promise((r) => setTimeout(r, 3000)) // wait 3s before retry
      return await uploadFn(stream, filename, mimeType)
    }
    throw err
  }
}

const handleUpload = async (req, res) => {
  let sourceStream      = null
  let gofilePassThrough = null
  let pixelPassThrough  = null
  let clientDisconnected = false

  try {
    const { driveLink } = req.body
    const clientIp = req.ip || req.connection.remoteAddress

    // ─── Validation ───────────────────────────────────────────────
    if (!driveLink || typeof driveLink !== 'string') {
      return res.status(400).json({ success: false, message: 'Please provide a valid download link.' })
    }
    const trimmedLink = driveLink.trim()
    if (!trimmedLink.startsWith('http://') && !trimmedLink.startsWith('https://')) {
      return res.status(400).json({ success: false, message: 'Link must start with http:// or https://' })
    }
    const detected = detectSource(trimmedLink)
    if (!detected) {
      return res.status(400).json({ success: false, message: 'Could not process this link.' })
    }

    // ✅ SSE — keeps HTTP connection alive during long transfers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // stop Nginx buffering SSE
    res.flushHeaders()

    // ✅ Detect client disconnect (browser tab closed, proxy killed connection)
    // When this fires mid-transfer we abort streams instead of getting ECONNRESET
    req.on('close', () => {
      if (!res.writableEnded) {
        clientDisconnected = true
        console.warn('⚠️  Client disconnected — aborting transfer and freeing streams')
        destroyStreams(sourceStream, gofilePassThrough, pixelPassThrough)
      }
    })

    console.log(`\n🔗 Source: ${detected.source.toUpperCase()}`)

    // ─── Metadata ─────────────────────────────────────────────────
    sendEvent(res, 'status', { message: '🔍 Fetching file metadata...' })

    let metadata
    if (detected.source === 'googledrive') {
      metadata = await getDriveFileMetadata(detected.fileId)
    } else {
      metadata = await getDirectFileMetadata(detected.url)
    }

    const fileSizeMB = (metadata.size / 1024 / 1024).toFixed(2)
    const fileSizeGB = (metadata.size / 1024 / 1024 / 1024).toFixed(2)
    console.log(`📁 File: ${metadata.filename}`)
    console.log(`📦 Size: ${fileSizeMB} MB (${fileSizeGB} GB)`)

    const safeFilename = validateFile(metadata.filename, metadata.size, metadata.mimeType)
    metadata.filename = safeFilename

    sendEvent(res, 'status', {
      message: `📁 ${metadata.filename} — ${fileSizeMB} MB — starting transfer...`,
    })

    // ─── Get Source Stream ────────────────────────────────────────
    let streamResult
    if (detected.source === 'googledrive') {
      streamResult = await getDriveFileStream(detected.fileId, metadata.mimeType)
      if (streamResult.exportExt && streamResult.exportMime) {
        const baseName = metadata.filename.replace(/\.[^/.]+$/, '') || metadata.filename
        metadata.filename = `${baseName}${streamResult.exportExt}`
        metadata.mimeType = streamResult.exportMime
      }
    } else if (detected.source === 'mediafire') {
      streamResult = await getMediaFireStream(detected.url)
    } else {
      streamResult = await getDirectFileStream(detected.url)
    }

    sourceStream = streamResult.stream

    // ✅ 4MB buffers — down from 64MB each (was 128MB total, now only 8MB total)
    gofilePassThrough = new PassThrough({ highWaterMark: 4 * 1024 * 1024 })
    pixelPassThrough  = new PassThrough({ highWaterMark: 4 * 1024 * 1024 })

    // ✅ Backpressure — track each stream independently
    let gofileDrained = true
    let pixelDrained  = true

    gofilePassThrough.on('drain', () => {
      gofileDrained = true
      if (gofileDrained && pixelDrained) sourceStream.resume()
    })
    pixelPassThrough.on('drain', () => {
      pixelDrained = true
      if (gofileDrained && pixelDrained) sourceStream.resume()
    })

    let bytesStreamed   = 0
    let lastLoggedMB    = 0
    const totalMB       = parseFloat(fileSizeMB)
    const logIntervalMB = totalMB > 500 ? 50 : totalMB > 100 ? 20 : 10

    sourceStream.on('data', (chunk) => {
      // ✅ Stop writing if client already disconnected
      if (clientDisconnected) {
        sourceStream.destroy()
        return
      }

      bytesStreamed += chunk.length
      const streamedMB = bytesStreamed / 1024 / 1024

      if (streamedMB - lastLoggedMB >= logIntervalMB) {
        lastLoggedMB = Math.floor(streamedMB / logIntervalMB) * logIntervalMB
        const percent = totalMB > 0 ? ((streamedMB / totalMB) * 100).toFixed(1) : '?'
        console.log(`📡 Streaming: ${streamedMB.toFixed(1)} MB / ${fileSizeMB} MB (${percent}%)`)
        sendEvent(res, 'progress', {
          streamed: streamedMB.toFixed(1),
          total:    fileSizeMB,
          percent,
        })
      }

      const canGofile = gofilePassThrough.write(chunk)
      const canPixel  = pixelPassThrough.write(chunk)
      if (!canGofile) gofileDrained = false
      if (!canPixel)  pixelDrained  = false
      if (!canGofile || !canPixel) sourceStream.pause()
    })

    sourceStream.on('end', () => {
      console.log(`\n✅ Download complete: ${(bytesStreamed / 1024 / 1024).toFixed(2)} MB`)
      gofilePassThrough.end()
      pixelPassThrough.end()
      sendEvent(res, 'status', { message: '✅ Download done — uploading to services...' })
    })

    sourceStream.on('error', (err) => {
      console.error(`❌ Source stream error: ${err.message}`)
      destroyStreams(gofilePassThrough, pixelPassThrough)
      sendEvent(res, 'error', { message: `Download failed: ${err.message}` })
      res.end()
    })

    // ─── Parallel Upload with retry ───────────────────────────────
    sendEvent(res, 'status', { message: '📤 Uploading to Gofile & PixelDrain...' })

    const [gofileResult, pixeldrainResult] = await Promise.allSettled([
      uploadWithRetry(uploadToGofile,     gofilePassThrough, metadata.filename, metadata.mimeType, 'Gofile'),
      uploadWithRetry(uploadToPixelDrain, pixelPassThrough,  metadata.filename, metadata.mimeType, 'PixelDrain'),
    ])

    // ✅ Free RAM immediately after upload regardless of outcome
    destroyStreams(sourceStream, gofilePassThrough, pixelPassThrough)

    // ─── Results ──────────────────────────────────────────────────
    const results = []
    const errors  = []
    let gofileLink = null,     gofileFileId     = null
    let pixeldrainLink = null, pixeldrainFileId = null

    if (gofileResult.status === 'fulfilled') {
      results.push(gofileResult.value)
      gofileLink   = gofileResult.value.downloadLink
      gofileFileId = gofileResult.value.fileId
      console.log(`✅ Gofile: ${gofileLink}`)
    } else {
      console.error(`❌ Gofile failed: ${gofileResult.reason.message}`)
      errors.push({ service: 'Gofile', error: gofileResult.reason.message })
    }

    if (pixeldrainResult.status === 'fulfilled') {
      results.push(pixeldrainResult.value)
      pixeldrainLink   = pixeldrainResult.value.downloadLink
      pixeldrainFileId = pixeldrainResult.value.fileId
      console.log(`✅ PixelDrain: ${pixeldrainLink}`)
    } else {
      console.error(`❌ PixelDrain failed: ${pixeldrainResult.reason.message}`)
      errors.push({ service: 'PixelDrain', error: pixeldrainResult.reason.message })
    }

    if (results.length === 0) {
      sendEvent(res, 'error', { message: 'Upload failed on all services. Please try again.' })
      return res.end()
    }

    // ─── Save to MongoDB ──────────────────────────────────────────
    try {
      const transfer = new Transfer({
        originalLink:        trimmedLink,
        source:              detected.source,
        fileId:              detected.fileId || null,
        filename:            metadata.filename,
        fileSize:            `${fileSizeMB} MB`,
        mimeType:            metadata.mimeType,
        gofileLink,          gofileFileId,
        pixeldrainLink,      pixeldrainFileId,
        uploadedByIp:        clientIp,
        gofileLastRefreshed: new Date(),
        gofileNextRefresh:   new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      })
      await transfer.save()
      console.log(`💾 Saved to MongoDB: ${transfer._id}`)
    } catch (dbErr) {
      console.error(`⚠️  MongoDB save failed: ${dbErr.message}`)
    }

    console.log(`\n🎉 Done! ${results.length} upload(s) successful!`)

    sendEvent(res, 'done', {
      success:  true,
      message:  `File uploaded to ${results.length} service(s).`,
      source:   detected.source,
      filename: metadata.filename,
      fileSize: `${fileSizeMB} MB`,
      links:    results,
      ...(errors.length > 0 && { warnings: errors }),
    })

    res.end()

  } catch (err) {
    console.error(`❌ handleUpload error: ${err.message}`)
    destroyStreams(sourceStream, gofilePassThrough, pixelPassThrough)
    if (!res.writableEnded) {
      if (res.headersSent) {
        sendEvent(res, 'error', { message: err.message || 'Server error' })
        res.end()
      } else {
        res.status(err.statusCode || 500).json({
          success: false,
          message: err.message || 'Server error',
        })
      }
    }
  }
}

const healthCheck = (req, res) => {
  res.status(200).json({
    success:   true,
    message:   '🟢 Server is running',
    timestamp: new Date().toISOString(),
    version:   '2.0.0',
  })
}

module.exports = { handleUpload, healthCheck }
