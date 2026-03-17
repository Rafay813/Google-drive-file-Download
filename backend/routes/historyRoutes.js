cat > /var/www/backend/routes/historyRoutes.js << 'EOF'
const express = require('express')
const router = express.Router()
const { getHistory, deleteHistory } = require('../controllers/historyController')

router.get('/history', getHistory)
router.delete('/history', deleteHistory)

module.exports = router
EOF