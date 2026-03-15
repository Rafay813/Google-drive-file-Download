const axios = require('axios');
const FormData = require('form-data');
const config = require('../config/env');
const { createError } = require('../utils/errorHandler.js');

const uploadToPixelDrain = async (fileStream, filename, mimeType) => {
  try {
    console.log(`📤 Uploading to PixelDrain: ${filename}`);

    const authToken = Buffer.from(`:${config.pixeldrainApiKey}`).toString('base64');

    const response = await axios.put(
      `https://pixeldrain.com/api/file/${encodeURIComponent(filename)}`,
      fileStream,
      {
        headers: {
          Authorization: `Basic ${authToken}`,
          'Content-Type': mimeType || 'application/octet-stream',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 300000,
      }
    );

    if (!response.data.id) {
      throw new Error('PixelDrain did not return a file ID');
    }

    const fileId = response.data.id;
    const downloadLink = `https://pixeldrain.com/u/${fileId}`;

    console.log(`✅ PixelDrain upload successful: ${downloadLink}`);

    return {
      service: 'PixelDrain',
      downloadLink: downloadLink,
      fileId: fileId,
    };
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      if (status === 401) throw createError('PixelDrain API key is invalid', 401);
      if (status === 413) throw createError('File too large for PixelDrain', 413);
      if (status === 422) throw createError('PixelDrain rejected the file', 422);
    }
    throw createError(`PixelDrain upload failed: ${err.message}`, 502);
  }
};

module.exports = { uploadToPixelDrain };