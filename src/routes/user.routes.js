const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');

// GET /api/users/profile
router.get('/profile', protect, async (req, res) => {
  const User = require('../models/User');
  const user = await User.findById(req.user._id);
  res.json({ success: true, data: user });
});

// PATCH /api/users/profile
router.patch('/profile', protect, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const allowed = ['name', 'avatar'];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// PATCH /api/users/change-password
router.patch('/change-password', protect, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) { next(err); }
});

// ------- Admin routes --------
// GET /api/users  (admin only)
router.get('/', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const User = require('../models/User');
    const { page = 1, limit = 20, role, search } = req.query;
    const filter = {};
    if (role)   filter.role = role;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    const users = await User.find(filter)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort('-createdAt');
    const total = await User.countDocuments(filter);
    res.json({ success: true, data: users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// PATCH /api/users/:id/status  (admin only)
router.patch('/:id/status', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

module.exports = router;
