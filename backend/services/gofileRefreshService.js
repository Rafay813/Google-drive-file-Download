const axios = require('axios');
const FormData = require('form-data');
const http = require('http');
const https = require('https');
const Transfer = require('../models/Transfer');
const { getDriveFileStream } = require('./gDrive');
const { getDirectFileStream } = require('./directService');
const { createError } = require('../utils/errorHandler');

const httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 60000 });
const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 60000 });

/**
 * Re-upload file to Gofile and update database
 */
const refreshGofileLink = async (transfer) => {
  console.log(`\n🔄 Refreshing Gofile link for: ${transfer.filename}`);

  try {
    // Update status to refreshing
    await Transfer.findByIdAndUpdate(transfer._id, { status: 'refreshing' });

    // Get fresh stream from original source
    let streamResult;
    if (transfer.source === 'googledrive' && transfer.fileId) {
      streamResult = await getDriveFileStream(transfer.fileId);
    } else {
      streamResult = await getDirectFileStream(transfer.originalLink);
    }

    const { stream } = streamResult;

    // Upload to Gofile
    const server = await getGofileServer();
    const uploadUrl = `https://${server}.gofile.io/uploadFile`;

    const formData = new FormData();
    formData.append('file', stream, {
      filename: transfer.filename,
      contentType: transfer.mimeType || 'application/octet-stream',
    });

    const response = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        'Connection': 'keep-alive',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 0,
      httpAgent,
      httpsAgent,
    });

    if (response.data.status !== 'ok') {
      throw new Error('Gofile upload failed during refresh');
    }

    const newGofileLink = response.data.data.downloadPage;
    const newGofileFileId = response.data.data.fileId;
    const nextRefresh = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    // Update database with new link
    await Transfer.findByIdAndUpdate(transfer._id, {
      gofileLink: newGofileLink,
      gofileFileId: newGofileFileId,
      gofileLastRefreshed: new Date(),
      gofileNextRefresh: nextRefresh,
      gofileRefreshCount: transfer.gofileRefreshCount + 1,
      status: 'active',
    });

    console.log(`✅ Gofile refreshed! New link: ${newGofileLink}`);
    console.log(`⏰ Next refresh: ${nextRefresh.toISOString()}`);

    return newGofileLink;

  } catch (err) {
    console.error(`❌ Failed to refresh Gofile link: ${err.message}`);
    await Transfer.findByIdAndUpdate(transfer._id, { status: 'failed' });
    throw err;
  }
};

/**
 * Get Gofile server
 */
const getGofileServer = async () => {
  const response = await axios.get('https://api.gofile.io/servers', { timeout: 10000 });
  if (response.data.status !== 'ok') throw new Error('Gofile server unavailable');
  return response.data.data.servers[0].name;
};

/**
 * Check and refresh all expired Gofile links
 * Called by cron job
 */
const checkAndRefreshExpiredLinks = async () => {
  try {
    const now = new Date();
    const expiredTransfers = await Transfer.find({
      gofileLink: { $ne: null },
      gofileNextRefresh: { $lte: now },
      status: 'active',
    });

    if (expiredTransfers.length === 0) {
      console.log('✅ No Gofile links need refreshing');
      return;
    }

    console.log(`\n🔄 Found ${expiredTransfers.length} Gofile link(s) to refresh`);

    for (const transfer of expiredTransfers) {
      try {
        await refreshGofileLink(transfer);
        // Wait 5 seconds between refreshes to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (err) {
        console.error(`❌ Failed to refresh ${transfer.filename}: ${err.message}`);
      }
    }

    console.log('✅ All expired Gofile links refreshed');

  } catch (err) {
    console.error(`❌ Refresh check error: ${err.message}`);
  }
};

module.exports = { refreshGofileLink, checkAndRefreshExpiredLinks };