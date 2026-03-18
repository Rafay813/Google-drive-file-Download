const axios = require('axios')
const https = require('https')
const { createError } = require('../utils/errorHandler')
const config = require('../config/env')

const httpsAgent = new https.Agent({
  keepAlive:      true,
  keepAliveMsecs: 30000,
  timeout:        0,
})

/**
 * Upload a readable stream to PixelDrain
 */
const uploadToPixelDrain = async (fileStream, filename, mimeType) => {
  try {
    console.log(`📤 Uploading to PixelDrain: ${filename}`)

    const authToken = Buffer.from(`:${config.pixeldrainApiKey}`).toString('base64')

    // ✅ Handle EPIPE on stream so it doesn't crash the process
    fileStream.on('error', (err) => {
      if (err.code === 'EPIPE') {
        console.warn('⚠️ PixelDrain stream EPIPE — connection closed early')
      }
    })

    const response = await axios.put(
      `https://pixeldrain.com/api/file/${encodeURIComponent(filename)}`,
      fileStream,
      {
        headers: {
          Authorization:  `Basic ${authToken}`,
          'Content-Type': mimeType || 'application/octet-stream',
          Connection:     'keep-alive',
        },
        maxContentLength: Infinity,
        maxBodyLength:    Infinity,
        timeout:          0,          // ✅ no timeout for large uploads
        httpsAgent,
      }
    )

    if (!response.data.id) {
      throw new Error('PixelDrain did not return a file ID')
    }

    const fileId       = response.data.id
    const downloadLink = `https://pixeldrain.com/u/${fileId}`

    console.log(`✅ PixelDrain upload successful: ${downloadLink}`)

    return {
      service: 'PixelDrain',
      downloadLink,
      fileId,
    }

  } catch (err) {
    if (err.code === 'EPIPE') {
      console.warn('⚠️ PixelDrain EPIPE suppressed')
      throw createError('PixelDrain connection dropped during upload', 502)
    }
    if (err.response) {
      const status = err.response.status
      if (status === 401) throw createError('PixelDrain API key is invalid', 401)
      if (status === 413) throw createError('File too large for PixelDrain', 413)
      if (status === 429) throw createError('PixelDrain rate limit reached — try again later', 429)
    }
    throw createError(`PixelDrain upload failed: ${err.message}`, 502)
  }
}

module.exports = { uploadToPixelDrain }
