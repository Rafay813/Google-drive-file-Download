const axios = require('axios');
const FormData = require('form-data');
const { createError } = require('../utils/errorHandler');

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

    const formData = new FormData();
    formData.append('file', fileStream, {
      filename: filename,
      contentType: mimeType || 'application/octet-stream',
    });

    const response = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000,
    });

    if (response.data.status !== 'ok') {
      throw new Error('Gofile upload returned non-ok status');
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
    throw createError(`Gofile upload failed: ${err.message}`, 502);
  }
};

module.exports = { uploadToGofile };