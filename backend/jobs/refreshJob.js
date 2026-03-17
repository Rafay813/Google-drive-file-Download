const cron = require('node-cron');
const { checkAndRefreshExpiredLinks } = require('../services/gofileRefreshService');

/**
 * Cron job — runs every 6 hours
 * Checks for Gofile links that need refreshing (every 10 days)
 */
const startRefreshJob = () => {
  console.log('⏰ Gofile refresh job scheduled (runs every 6 hours)');

  // Run every 6 hours: 0 */6 * * *
  cron.schedule('0 */6 * * *', async () => {
    console.log('\n⏰ Running Gofile refresh job...');
    await checkAndRefreshExpiredLinks();
  });

  // Also run once on startup to catch any missed refreshes
  setTimeout(async () => {
    console.log('\n⏰ Running initial Gofile refresh check...');
    await checkAndRefreshExpiredLinks();
  }, 5000);
};

module.exports = { startRefreshJob };