const axios = require('axios')
const { createError } = require('../utils/errorHandler')

/**
 * Get metadata from any direct URL
 */
const getDirectFileMetadata = async (url) => {
  try {
    const response = await axios.head(url, {
      maxRedirects: 10,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    const contentDisposition = response.headers['content-disposition'] || ''
    const contentLength = response.headers['content-length'] || 0
    const contentType = response.headers['content-type'] || 'application/octet-stream'

    // Extract filename from content-disposition
    let filename = extractFilenameFromUrl(url)
    const nameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i)
    if (nameMatch && nameMatch[1]) {
      filename = decodeURIComponent(nameMatch[1].trim())
    }

    return {
      filename,
      size: parseInt(contentLength, 10),
      mimeType: contentType.split(';')[0].trim(),
    }
  } catch (err) {
    // HEAD failed — try GET with stream
    try {
      const response = await axios.get(url, {
        maxRedirects: 10,
        timeout: 30000,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      response.data.destroy()

      const contentDisposition = response.headers['content-disposition'] || ''
      const contentLength = response.headers['content-length'] || 0
      const contentType = response.headers['content-type'] || 'application/octet-stream'

      let filename = extractFilenameFromUrl(url)
      const nameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i)
      if (nameMatch && nameMatch[1]) {
        filename = decodeURIComponent(nameMatch[1].trim())
      }

      return {
        filename,
        size: parseInt(contentLength, 10),
        mimeType: contentType.split(';')[0].trim(),
      }
    } catch (err2) {
      throw createError(`Failed to fetch metadata: ${err2.message}`, 400)
    }
  }
}

/**
 * Get file stream from any direct URL
 */
const getDirectFileStream = async (url) => {
  try {
    console.log(`⬇️  Streaming from: ${url}`)

    const response = await axios.get(url, {
      maxRedirects: 10,
      timeout: 30000,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
    })

    return {
      stream: response.data,
      headers: response.headers,
    }
  } catch (err) {
    throw createError(`Failed to stream file from URL: ${err.message}`, 400)
  }
}

/**
 * Get MediaFire direct download link
 */
const getMediaFireStream = async (url) => {
  try {
    console.log('🔄 Extracting MediaFire direct link...')

    const pageResponse = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    const html = pageResponse.data

    // Extract direct download link from MediaFire page
    const patterns = [
      /href="(https:\/\/download\d+\.mediafire\.com[^"]+)"/,
      /id="downloadButton"\s+href="([^"]+)"/,
      /"result":\s*"(https:\/\/[^"]+mediafire[^"]+)"/,
    ]

    let directLink = null
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        directLink = match[1]
        break
      }
    }

    if (!directLink) {
      throw createError('Could not extract MediaFire download link', 400)
    }

    console.log(`✅ MediaFire direct link found`)
    return getDirectFileStream(directLink)

  } catch (err) {
    if (err.statusCode) throw err
    throw createError(`MediaFire extraction failed: ${err.message}`, 400)
  }
}

/**
 * Extract filename from URL path
 */
const extractFilenameFromUrl = (url) => {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const parts = pathname.split('/')
    const lastPart = parts[parts.length - 1]
    if (lastPart && lastPart.includes('.')) {
      return decodeURIComponent(lastPart)
    }
    return `file_${Date.now()}`
  } catch {
    return `file_${Date.now()}`
  }
}

module.exports = {
  getDirectFileMetadata,
  getDirectFileStream,
  getMediaFireStream,
}