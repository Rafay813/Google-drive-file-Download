const express = require('express')
const router = express.Router()
const { handleUpload, healthCheck } = require('../controllers/uploadController')
const { getHistory, deleteHistory } = require('../controllers/historyController')
const { uploadLimiter } = require('../middleware/rateLimiter')

router.get('/health', healthCheck)
router.post('/upload', uploadLimiter, handleUpload)
router.get('/history', getHistory)
router.delete('/history', deleteHistory)

module.exports = router