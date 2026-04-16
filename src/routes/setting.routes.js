const express = require('express');
const router  = express.Router();
const Setting = require('../models/Setting');
const { protect, authorize } = require('../middleware/auth');

const cache = new Map();

// GET /api/settings/:key
router.get('/:key', async (req, res, next) => {
  try {
    const key = req.params.key;
    if (cache.has(key)) {
      return res.json({ success: true, data: cache.get(key) });
    }

    const setting = await Setting.findOne({ key });
    const value = setting ? setting.value : null;
    
    cache.set(key, value);
    res.json({ success: true, data: value });
  } catch (err) { next(err); }
});

// POST /api/settings/:key
router.post('/:key', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const key = req.params.key;
    const value = req.body.value;
    
    const setting = await Setting.findOneAndUpdate(
      { key },
      { value },
      { upsert: true, new: true }
    );
    
    // Update cache
    cache.set(key, value);
    res.json({ success: true, data: setting.value });
  } catch (err) { next(err); }
});

module.exports = router;
