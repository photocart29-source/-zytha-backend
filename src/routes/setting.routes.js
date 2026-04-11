const express = require('express');
const router  = express.Router();
const Setting = require('../models/Setting');
const { protect, authorize } = require('../middleware/auth');

// GET /api/settings/:key
router.get('/:key', async (req, res, next) => {
  try {
    const setting = await Setting.findOne({ key: req.params.key });
    res.json({ success: true, data: setting ? setting.value : null });
  } catch (err) { next(err); }
});

// POST /api/settings/:key
router.post('/:key', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const setting = await Setting.findOneAndUpdate(
      { key: req.params.key },
      { value: req.body.value },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: setting.value });
  } catch (err) { next(err); }
});

module.exports = router;
