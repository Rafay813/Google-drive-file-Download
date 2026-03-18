const axios = require('axios')
const { createError } = require('../utils/errorHandler')

/**
 * Extract filename from URL path
 */
const extractFilenameFromUrl = (url) => {
  try {
    const urlObj  = new URL(url)
    const parts   = urlObj.pathname.split('/')
    const lastPart = parts[parts.length - 1]
    if (lastPart && lastPart.includes('.')) {
      return decodeURIComponent(lastPart)
    }
    return `file_${Date.now()}`
  } catch {
    return `file_${Date.now()}`
  }
}

/**
 * ✅ Safely parse content-length — parseInt alone returns NaN when header
 * is missing, which breaks file-size calculations downstream
 */
const parseContentLength = (value) => {
  if (!value) return 0
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Parse filename from content-disposition header
 */
const parseFilename = (contentDisposition, fallbackUrl) => {
  const nameMatch = contentDisposition.match(
    /filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i
  )
  if (nameMatch?.[1]) return decodeURIComponent(nameMatch[1].trim())
  return extractFilenameFromUrl(fallbackUrl)
}

/**
 * Get metadata from any direct URL
 */
const getDirectFileMetadata = async (url) => {
  // ── Try HEAD first (cheap — no body download) ───────────────────
  try {
    const response = await axios.head(url, {
      maxRedirects: 10,
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    return {
      filename: parseFilename(response.headers['content-disposition'] || '', url),
      size:     parseContentLength(response.headers['content-length']),   // ✅ safe
      mimeType: (response.headers['content-type'] || 'application/octet-stream').split(';')[0].trim(),
    }
  } catch {
    // HEAD not supported — fall through to GET
  }

  // ── Fallback: GET stream, read headers only, then destroy ────────
  try {
    const response = await axios.get(url, {
      maxRedirects: 10,
      timeout: 30000,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    response.data.destroy() // we only need headers

    return {
      filename: parseFilename(response.headers['content-disposition'] || '', url),
      size:     parseContentLength(response.headers['content-length']),   // ✅ safe
      mimeType: (response.headers['content-type'] || 'application/octet-stream').split(';')[0].trim(),
    }
  } catch (err) {
    throw createError(`Failed to fetch metadata: ${err.message}`, 400)
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
      timeout: 0,             // ✅ no timeout — large files can take hours
      responseType: 'stream',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
      },
    })

    return {
      stream:  response.data,
      headers: response.headers,
    }
  } catch (err) {
    throw createError(`Failed to stream file from URL: ${err.message}`, 400)
  }
}

/**
 * Get MediaFire direct download link and stream it
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

    const patterns = [
      /href="(https:\/\/download\d+\.mediafire\.com[^"]+)"/,
      /id="downloadButton"\s+href="([^"]+)"/,
      /"result":\s*"(https:\/\/[^"]+mediafire[^"]+)"/,
    ]

    let directLink = null
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match?.[1]) {
        directLink = match[1]
        break
      }
    }

    if (!directLink) {
      throw createError('Could not extract MediaFire download link', 400)
    }

    console.log('✅ MediaFire direct link found')
    return getDirectFileStream(directLink)
  } catch (err) {
    if (err.statusCode) throw err
    throw createError(`MediaFire extraction failed: ${err.message}`, 400)
  }
}

module.exports = {
  getDirectFileMetadata,
  getDirectFileStream,
  getMediaFireStream,
}
