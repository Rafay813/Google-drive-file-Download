const axios = require('axios')
const FormData = require('form-data')
const http = require('http')
const https = require('https')
const { createError } = require('../utils/errorHandler')

const httpAgent = new http.Agent({
  keepAlive:      true,
  keepAliveMsecs: 60000,
  maxSockets:     10,
  timeout:        0,
})

const httpsAgent = new https.Agent({
  keepAlive:      true,
  keepAliveMsecs: 60000,
  maxSockets:     10,
  timeout:        0,
})

/**
 * Fetch ALL Gofile servers (all zones) so we can retry on failure
 */
const getGofileServers = async () => {
  try {
    const response = await axios.get('https://api.gofile.io/servers', {
      timeout: 10000,
    })

    if (response.data.status !== 'ok') {
      throw new Error('Gofile server list unavailable')
    }

    // ✅ Use serversAllZone — gives us all servers to retry across
    const all = response.data.data.serversAllZone
    if (!all || all.length === 0) {
      throw new Error('No Gofile servers available')
    }

    // ✅ Prefer NA servers first (closer to most hosts), fall back to EU
    const na = all.filter(s => s.zone === 'na')
    const eu = all.filter(s => s.zone === 'eu')
    return [...na, ...eu].map(s => s.name)

  } catch (err) {
    throw createError(`Gofile server fetch failed: ${err.message}`, 503)
  }
}

/**
 * Upload a readable stream to Gofile — retries across servers on 500
 */
const uploadToGofile = async (fileStream, filename, mimeType) => {
  let servers
  try {
    servers = await getGofileServers()
  } catch (err) {
    throw err
  }

  console.log(`📤 Uploading to Gofile: ${filename}`)
  console.log(`🌐 Available servers: ${servers.slice(0, 5).join(', ')}...`)

  let lastError = null

  // ✅ Try up to 3 servers before giving up
  for (let i = 0; i < Math.min(3, servers.length); i++) {
    const server    = servers[i]
    const uploadUrl = `https://${server}.gofile.io/uploadFile`
    console.log(`🔄 Trying Gofile server: ${server}`)

    try {
      const formData = new FormData()
      formData.append('file', fileStream, {
        filename:    filename,
        contentType: mimeType || 'application/octet-stream',
      })

      fileStream.on('error', (err) => {
        if (err.code === 'EPIPE') {
          console.warn(`⚠️ Gofile stream EPIPE on ${server}`)
        }
      })

      let lastLoggedMB = 0

      const response = await axios.post(uploadUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          Connection:   'keep-alive',
          'Keep-Alive': 'timeout=600, max=1000',
        },
        maxContentLength: Infinity,
        maxBodyLength:    Infinity,
        timeout:          0,
        httpAgent,
        httpsAgent,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.loaded) {
            const uploadedMB = (progressEvent.loaded / 1024 / 1024).toFixed(1)
            if (parseFloat(uploadedMB) - lastLoggedMB >= 50) {
              lastLoggedMB = Math.floor(parseFloat(uploadedMB) / 50) * 50
              process.stdout.write(`\r📤 Gofile uploaded: ${uploadedMB} MB`)
            }
          }
        },
      })

      console.log('') // newline after progress

      if (response.data.status !== 'ok') {
        throw new Error(`Gofile upload returned: ${response.data.status}`)
      }

      const downloadPage = response.data.data.downloadPage
      const fileId       = response.data.data.fileId

      console.log(`✅ Gofile upload successful: ${downloadPage}`)

      return {
        service:      'Gofile',
        downloadLink: downloadPage,
        fileId,
      }

    } catch (err) {
      const status = err.response?.status
      console.error(`❌ Gofile server ${server} failed (HTTP ${status || err.code}): ${err.message}`)
      lastError = err

      // ✅ Only retry on server-side errors (5xx) — not on client errors (4xx)
      if (status && status >= 400 && status < 500) {
        break // no point retrying different servers for 4xx
      }

      if (err.code === 'EPIPE') break // stream already consumed, can't retry

      if (i < Math.min(3, servers.length) - 1) {
        console.log(`⏳ Waiting 2s before trying next server...`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  // All servers failed
  const status = lastError?.response?.status
  if (status === 413)          throw createError('File too large for Gofile', 413)
  if (lastError?.code === 'EPIPE') throw createError('Gofile connection dropped during upload', 502)
  throw createError(`Gofile upload failed: ${lastError?.message}`, 502)
}

module.exports = { uploadToGofile }
