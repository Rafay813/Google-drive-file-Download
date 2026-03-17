const Transfer = require('../models/Transfer')

const getHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20

    const transfers = await Transfer.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .select('filename fileSize gofileLink pixeldrainLink createdAt source')

    const total = await Transfer.countDocuments()

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: transfers,
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
}

const deleteHistory = async (req, res) => {
  try {
    await Transfer.deleteMany({})
    res.status(200).json({ success: true, message: 'History cleared' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
}

module.exports = { getHistory, deleteHistory }