const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema({

  // ─── Original Link ───────────────────────────────────────────
  originalLink: {
    type: String,
    required: true,
    trim: true,
  },

  source: {
    type: String,
    enum: ['googledrive', 'direct', 'mediafire', 'dropbox', 'onedrive'],
    default: 'googledrive',
  },

  fileId: {
    type: String,
    default: null,
  },

  // ─── File Info ───────────────────────────────────────────────
  filename: {
    type: String,
    required: true,
  },

  fileSize: {
    type: String,
    default: '0 MB',
  },

  mimeType: {
    type: String,
    default: 'application/octet-stream',
  },

  // ─── Generated Links ─────────────────────────────────────────
  gofileLink: {
    type: String,
    default: null,
  },

  gofileFileId: {
    type: String,
    default: null,
  },

  pixeldrainLink: {
    type: String,
    default: null,
  },

  pixeldrainFileId: {
    type: String,
    default: null,
  },

  // ─── Gofile Refresh Tracking ─────────────────────────────────
  gofileLastRefreshed: {
    type: Date,
    default: Date.now,
  },

  gofileNextRefresh: {
    type: Date,
    default: () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days
  },

  gofileRefreshCount: {
    type: Number,
    default: 0,
  },

  // ─── Status ──────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['active', 'refreshing', 'failed'],
    default: 'active',
  },

  // ─── IP Tracking ─────────────────────────────────────────────
  uploadedByIp: {
    type: String,
    default: null,
  },

}, {
  timestamps: true, // adds createdAt and updatedAt
});

// Index for fast queries
transferSchema.index({ createdAt: -1 });
transferSchema.index({ gofileNextRefresh: 1 });
transferSchema.index({ originalLink: 1 });

module.exports = mongoose.model('Transfer', transferSchema);