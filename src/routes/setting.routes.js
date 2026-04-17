const express = require('express');
const router  = express.Router();
const Setting = require('../models/Setting');
const { protect, authorize } = require('../middleware/auth');

const cache = new Map();

const TTL = 10 * 60 * 1000; // 10 minutes cache

// GET /api/settings/:key
router.get('/:key', async (req, res, next) => {
  try {
    const key = req.params.key;
    const cached = cache.get(key);

    if (cached && Date.now() < cached.expiresAt) {
      return res.json({ success: true, data: cached.value });
    }

    const setting = await Setting.findOne({ key });
    const value = setting ? setting.value : null;
    
    cache.set(key, { value, expiresAt: Date.now() + TTL });
    res.json({ success: true, data: value });
  } catch (err) { next(err); }
});

// POST /api/settings/:key (Upsert)
router.post('/:key', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const key = req.params.key;
    const value = req.body.value;
    
    const setting = await Setting.findOneAndUpdate(
      { key },
      { value },
      { upsert: true, new: true }
    );
    
    // Invalidate/Update cache
    cache.set(key, { value, expiresAt: Date.now() + TTL });
    res.json({ success: true, data: setting.value });
  } catch (err) { next(err); }
});

// DELETE /api/settings/:key
router.delete('/:key', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const key = req.params.key;
    await Setting.findOneAndDelete({ key });
    
    // Invalidate cache
    cache.delete(key);
    res.json({ success: true, message: 'Setting deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
