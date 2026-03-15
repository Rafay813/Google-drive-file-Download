const axios = require('axios');
const { createError } = require('../utils/errorHandler');
const config = require('../config/env');

const getDriveFileMetadata = async (fileId) => {
  try {
    const url = `https://drive.google.com/uc?id=${fileId}&export=download`;

    const response = await axios.get(url, {
      maxRedirects: 5,
      timeout: 15000,
      responseType: 'stream',
    });

    response.data.destroy();

    const contentDisposition = response.headers['content-disposition'] || '';
    const contentLength = response.headers['content-length'] || 0;
    const contentType = response.headers['content-type'] || 'application/octet-stream';

    let filename = `file_${fileId}`;
    const nameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
    if (nameMatch && nameMatch[1]) {
      filename = decodeURIComponent(nameMatch[1].trim());
    }

    const size = parseInt(contentLength, 10);

    // ─── Early size check before streaming ───────────────────────
    if (size > config.maxFileSizeBytes) {
      const sizeMB = (size / 1024 / 1024).toFixed(2);
      throw createError(`File too large: ${sizeMB}MB. Max allowed is 500MB.`, 413);
    }

    return {
      filename,
      size,
      mimeType: contentType.split(';')[0].trim(),
    };
  } catch (err) {
    if (err.statusCode) throw err;
    throw createError(`Failed to fetch metadata from Google Drive: ${err.message}`, 400);
  }
};

const getDriveFileStream = async (fileId) => {
  try {
    const initialUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;

    const initialResponse = await axios.get(initialUrl, {
      maxRedirects: 5,
      timeout: 20000,
      responseType: 'stream',
    });

    const contentType = initialResponse.headers['content-type'] || '';

    if (contentType.includes('text/html')) {
      console.log('⚠️  Large file detected — extracting confirm token...');
      initialResponse.data.destroy();

      const confirmToken = await extractConfirmToken(fileId);
      const confirmedUrl = `https://drive.google.com/uc?id=${fileId}&export=download&confirm=${confirmToken}&uuid=${Date.now()}`;

      const confirmedResponse = await axios.get(confirmedUrl, {
        maxRedirects: 5,
        timeout: 20000,
        responseType: 'stream',
      });

      return {
        stream: confirmedResponse.data,
        headers: confirmedResponse.headers,
      };
    }

    return {
      stream: initialResponse.data,
      headers: initialResponse.headers,
    };
  } catch (err) {
    if (err.statusCode) throw err;
    throw createError(`Failed to stream file from Google Drive: ${err.message}`, 400);
  }
};

const extractConfirmToken = async (fileId) => {
  try {
    const url = `https://drive.google.com/uc?id=${fileId}&export=download`;
    const response = await axios.get(url, { timeout: 10000 });
    const html = response.data;

    const match = html.match(/confirm=([0-9A-Za-z_-]+)/);
    if (match && match[1]) return match[1];

    const altMatch = html.match(/name="confirm" value="([^"]+)"/);
    if (altMatch && altMatch[1]) return altMatch[1];

    return 't';
  } catch (err) {
    return 't';
  }
};

module.exports = { getDriveFileStream, getDriveFileMetadata };