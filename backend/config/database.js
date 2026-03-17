const mongoose = require('mongoose');
const config = require('./env');

const connectDB = async () => {
  if (!config.mongoUri) {
    console.log('⚠️  No MongoDB URI — running without database');
    return;
  }

  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (err) {
    console.error(`⚠️  MongoDB failed: ${err.message}`);
    console.log('⚠️  Server running WITHOUT database — uploads still work!');
  }
};

mongoose.connection.on('error', (err) => {
  // Don't crash on connection errors
  console.error(`⚠️  MongoDB error: ${err.message}`);
});

module.exports = connectDB;