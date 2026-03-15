const { getDriveFileStream, getDriveFileMetadata } = require('../services/gDrive.js');
const { uploadToGofile } = require('../services/gofileService.js');
const { uploadToPixelDrain } = require('../services/pixeldrainService.js');
const extractDriveId = require('../utils/extractDriveId.js');
const { createError } = require('../utils/errorHandler.js');
const { sanitizeDriveLink } = require('../utils/sanitize.js');
const validateFile = require('../utils/validateFile.js');
const { PassThrough } = require('stream');

const handleUpload = async (req, res, next) => {
  try {
    const { driveLink } = req.body;

    // ─── 1. Sanitize input ───────────────────────────────────────
    const sanitizedLink = sanitizeDriveLink(driveLink);
    if (!sanitizedLink) {
      throw createError(
        'Invalid Google Drive URL. Make sure it starts with https://drive.google.com',
        400
      );
    }

    // ─── 2. Extract file ID ──────────────────────────────────────
    const fileId = extractDriveId(sanitizedLink);
    if (!fileId) {
      throw createError(
        'Could not extract file ID. Make sure the link is a valid public Google Drive link.',
        400
      );
    }

    console.log(`\n🔗 Processing Drive File ID: ${fileId}`);

    // ─── 3. Get file metadata ────────────────────────────────────
    console.log('📋 Fetching file metadata...');
    const metadata = await getDriveFileMetadata(fileId);
    console.log(`📁 File: ${metadata.filename} | Size: ${(metadata.size / 1024 / 1024).toFixed(2)} MB | Type: ${metadata.mimeType}`);

    // ─── 4. Validate file (size + type) ─────────────────────────
    const safeFilename = validateFile(metadata.filename, metadata.size, metadata.mimeType);
    metadata.filename = safeFilename;

    // ─── 5. Get file stream from Google Drive ────────────────────
    console.log('⬇️  Streaming file from Google Drive...');
    const { stream: driveStream } = await getDriveFileStream(fileId);

    // ─── 6. Split stream into two PassThrough streams ────────────
    const gofilePassThrough = new PassThrough();
    const pixeldrainPassThrough = new PassThrough();

    let streamError = null;

    driveStream.on('data', (chunk) => {
      const canWriteGofile = gofilePassThrough.write(chunk);
      const canWritePixel = pixeldrainPassThrough.write(chunk);

      // Backpressure handling — pause if buffer is full
      if (!canWriteGofile || !canWritePixel) {
        driveStream.pause();
      }
    });

    gofilePassThrough.on('drain', () => driveStream.resume());
    pixeldrainPassThrough.on('drain', () => driveStream.resume());

    driveStream.on('end', () => {
      gofilePassThrough.end();
      pixeldrainPassThrough.end();
    });

    driveStream.on('error', (err) => {
      streamError = err;
      gofilePassThrough.destroy(err);
      pixeldrainPassThrough.destroy(err);
    });

    // ─── 7. Upload to both services in parallel ──────────────────
    console.log('📤 Uploading to Gofile and PixelDrain in parallel...');

    const [gofileResult, pixeldrainResult] = await Promise.allSettled([
      uploadToGofile(gofilePassThrough, metadata.filename, metadata.mimeType),
      uploadToPixelDrain(pixeldrainPassThrough, metadata.filename, metadata.mimeType),
    ]);

    // ─── 8. Process results ──────────────────────────────────────
    const results = [];
    const errors = [];

    if (gofileResult.status === 'fulfilled') {
      results.push(gofileResult.value);
    } else {
      console.error(`❌ Gofile failed: ${gofileResult.reason.message}`);
      errors.push({ service: 'Gofile', error: gofileResult.reason.message });
    }

    if (pixeldrainResult.status === 'fulfilled') {
      results.push(pixeldrainResult.value);
    } else {
      console.error(`❌ PixelDrain failed: ${pixeldrainResult.reason.message}`);
      errors.push({ service: 'PixelDrain', error: pixeldrainResult.reason.message });
    }

    // ─── 9. If both failed ────────────────────────────────────────
    if (results.length === 0) {
      throw createError('Upload failed on all services. Please try again.', 502);
    }

    // ─── 10. Success response ─────────────────────────────────────
    console.log(`✅ Done! ${results.length} upload(s) successful.\n`);

    return res.status(200).json({
      success: true,
      message: `File uploaded successfully to ${results.length} service(s).`,
      filename: metadata.filename,
      fileSize: `${(metadata.size / 1024 / 1024).toFixed(2)} MB`,
      links: results,
      ...(errors.length > 0 && { warnings: errors }),
    });

  } catch (err) {
    next(err);
  }
};

const healthCheck = (req, res) => {
  res.status(200).json({
    success: true,
    message: '🟢 Server is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
};

module.exports = { handleUpload, healthCheck };