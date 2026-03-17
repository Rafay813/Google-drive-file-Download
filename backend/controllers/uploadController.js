const { getDriveFileStream, getDriveFileMetadata } = require('../services/gDrive.js')
const { getDirectFileMetadata, getDirectFileStream, getMediaFireStream } = require('../services/directService.js')
const { uploadToGofile } = require('../services/gofileService.js')
const { uploadToPixelDrain } = require('../services/pixeldrainService.js')
const { detectSource } = require('../utils/detectSource.js')
const { createError } = require('../utils/errorHandler.js')
const validateFile = require('../utils/validateFile.js')
const { PassThrough } = require('stream')
const Transfer = require('../models/Transfer.js')

const handleUpload = async (req, res, next) => {
  try {
    const { driveLink } = req.body
    const clientIp = req.ip || req.connection.remoteAddress

    if (!driveLink || typeof driveLink !== 'string') {
      throw createError('Please provide a valid download link.', 400)
    }

    const trimmedLink = driveLink.trim()
    if (!trimmedLink.startsWith('http://') && !trimmedLink.startsWith('https://')) {
      throw createError('Link must start with http:// or https://', 400)
    }

    const detected = detectSource(trimmedLink)
    if (!detected) {
      throw createError('Could not process this link.', 400)
    }

    console.log(`\n🔗 Source: ${detected.source.toUpperCase()}`)
    console.log(`📎 URL: ${detected.url}`)

    console.log('📋 Fetching file metadata...')
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
    console.log(`🎭 Type: ${metadata.mimeType}`)

    const safeFilename = validateFile(metadata.filename, metadata.size, metadata.mimeType)
    metadata.filename = safeFilename

    console.log('\n⬇️  Starting file stream...')
    let streamResult

    if (detected.source === 'googledrive') {
      // ── Pass mimeType so Google Workspace files get exported correctly ──
      streamResult = await getDriveFileStream(detected.fileId, metadata.mimeType)

      // If it was exported, update metadata to reflect the new format
      if (streamResult.exportExt && streamResult.exportMime) {
        const baseName = metadata.filename.replace(/\.[^/.]+$/, '') || metadata.filename
        metadata.filename = `${baseName}${streamResult.exportExt}`
        metadata.mimeType = streamResult.exportMime
        console.log(`📝 Exported filename: ${metadata.filename}`)
        console.log(`📝 Exported mimeType: ${metadata.mimeType}`)
      }
    } else if (detected.source === 'mediafire') {
      streamResult = await getMediaFireStream(detected.url)
    } else {
      streamResult = await getDirectFileStream(detected.url)
    }

    const { stream: sourceStream } = streamResult

    let bytesStreamed = 0
    let lastLoggedMB = 0
    const totalMB = parseFloat(fileSizeMB)
    const logIntervalMB = totalMB > 500 ? 50 : totalMB > 100 ? 20 : 10

    const gofilePassThrough = new PassThrough({ highWaterMark: 64 * 1024 * 1024 })
    const pixeldrainPassThrough = new PassThrough({ highWaterMark: 64 * 1024 * 1024 })

    sourceStream.on('data', (chunk) => {
      bytesStreamed += chunk.length
      const streamedMB = bytesStreamed / 1024 / 1024

      if (streamedMB - lastLoggedMB >= logIntervalMB) {
        lastLoggedMB = Math.floor(streamedMB / logIntervalMB) * logIntervalMB
        const percent = totalMB > 0 ? ((streamedMB / totalMB) * 100).toFixed(1) : '?'
        console.log(`📡 Streaming: ${streamedMB.toFixed(1)} MB / ${fileSizeMB} MB (${percent}%)`)
      }

      const canWriteGofile = gofilePassThrough.write(chunk)
      const canWritePixel = pixeldrainPassThrough.write(chunk)

      if (!canWriteGofile || !canWritePixel) sourceStream.pause()
    })

    gofilePassThrough.on('drain', () => sourceStream.resume())
    pixeldrainPassThrough.on('drain', () => sourceStream.resume())

    sourceStream.on('end', () => {
      const totalStreamed = (bytesStreamed / 1024 / 1024).toFixed(2)
      console.log(`\n✅ Stream complete! Total: ${totalStreamed} MB`)
      gofilePassThrough.end()
      pixeldrainPassThrough.end()
    })

    sourceStream.on('error', (err) => {
      console.error(`❌ Stream error: ${err.message}`)
      gofilePassThrough.destroy(err)
      pixeldrainPassThrough.destroy(err)
    })

    console.log('\n📤 Uploading to Gofile and PixelDrain in parallel...')
    console.log('⏳ This may take several minutes for large files...\n')

    const [gofileResult, pixeldrainResult] = await Promise.allSettled([
      uploadToGofile(gofilePassThrough, metadata.filename, metadata.mimeType),
      uploadToPixelDrain(pixeldrainPassThrough, metadata.filename, metadata.mimeType),
    ])

    const results = []
    const errors = []

    let gofileLink = null
    let gofileFileId = null
    let pixeldrainLink = null
    let pixeldrainFileId = null

    if (gofileResult.status === 'fulfilled') {
      results.push(gofileResult.value)
      gofileLink = gofileResult.value.downloadLink
      gofileFileId = gofileResult.value.fileId
      console.log(`✅ Gofile: ${gofileLink}`)
    } else {
      console.error(`❌ Gofile failed: ${gofileResult.reason.message}`)
      errors.push({ service: 'Gofile', error: gofileResult.reason.message })
    }

    if (pixeldrainResult.status === 'fulfilled') {
      results.push(pixeldrainResult.value)
      pixeldrainLink = pixeldrainResult.value.downloadLink
      pixeldrainFileId = pixeldrainResult.value.fileId
      console.log(`✅ PixelDrain: ${pixeldrainLink}`)
    } else {
      console.error(`❌ PixelDrain failed: ${pixeldrainResult.reason.message}`)
      errors.push({ service: 'PixelDrain', error: pixeldrainResult.reason.message })
    }

    if (results.length === 0) {
      throw createError('Upload failed on all services. Please try again.', 502)
    }

    try {
      const transfer = new Transfer({
        originalLink: trimmedLink,
        source: detected.source,
        fileId: detected.fileId || null,
        filename: metadata.filename,
        fileSize: `${fileSizeMB} MB`,
        mimeType: metadata.mimeType,
        gofileLink,
        gofileFileId,
        pixeldrainLink,
        pixeldrainFileId,
        uploadedByIp: clientIp,
        gofileLastRefreshed: new Date(),
        gofileNextRefresh: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      })

      await transfer.save()
      console.log(`💾 Saved to MongoDB: ${transfer._id}`)
    } catch (dbErr) {
      console.error(`⚠️  MongoDB save failed: ${dbErr.message}`)
    }

    console.log(`\n🎉 Done! ${results.length} upload(s) successful!`)

    return res.status(200).json({
      success: true,
      message: `File uploaded successfully to ${results.length} service(s).`,
      source: detected.source,
      filename: metadata.filename,
      fileSize: `${fileSizeMB} MB`,
      links: results,
      ...(errors.length > 0 && { warnings: errors }),
    })

  } catch (err) {
    next(err)
  }
}

const healthCheck = (req, res) => {
  res.status(200).json({
    success: true,
    message: '🟢 Server is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  })
}

module.exports = { handleUpload, healthCheck }