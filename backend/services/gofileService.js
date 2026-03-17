const axios = require('axios');
const FormData = require('form-data');
const http = require('http');
const https = require('https');
const { createError } = require('../utils/errorHandler');

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 10,
  timeout: 0,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 10,
  timeout: 0,
});

const getGofileServer = async () => {
  try {
    const response = await axios.get('https://api.gofile.io/servers', {
      timeout: 10000,
    });

    if (response.data.status !== 'ok') {
      throw new Error('Gofile server list unavailable');
    }

    const servers = response.data.data.servers;
    if (!servers || servers.length === 0) {
      throw new Error('No Gofile servers available');
    }

    // Pick best server
    return servers[0].name;
  } catch (err) {
    throw createError(`Gofile server fetch failed: ${err.message}`, 503);
  }
};

const uploadToGofile = async (fileStream, filename, mimeType) => {
  try {
    console.log(`📤 Uploading to Gofile: ${filename}`);

    const server = await getGofileServer();
    const uploadUrl = `https://${server}.gofile.io/uploadFile`;

    console.log(`🌐 Gofile server: ${server}`);

    const formData = new FormData();
    formData.append('file', fileStream, {
      filename: filename,
      contentType: mimeType || 'application/octet-stream',
      knownLength: Infinity,
    });

    const response = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=600, max=1000',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 0,
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
      onUploadProgress: (progressEvent) => {
        if (progressEvent.loaded) {
          const uploadedMB = (progressEvent.loaded / 1024 / 1024).toFixed(1)
          process.stdout.write(`\r📤 Gofile uploaded: ${uploadedMB} MB`)
        }
      },
    });

    console.log('') // new line after progress

    if (response.data.status !== 'ok') {
      throw new Error(`Gofile upload returned: ${response.data.status}`)
    }

    const downloadPage = response.data.data.downloadPage;
    const fileId = response.data.data.fileId;

    console.log(`✅ Gofile upload successful: ${downloadPage}`);

    return {
      service: 'Gofile',
      downloadLink: downloadPage,
      fileId: fileId,
    };

  } catch (err) {
    console.error(`❌ Gofile error: ${err.message}`)
    throw createError(`Gofile upload failed: ${err.message}`, 502);
  }
};

module.exports = { uploadToGofile };