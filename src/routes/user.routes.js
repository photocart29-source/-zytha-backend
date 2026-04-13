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

// ─── Address Routes ──────────────────────────────────────────────────────────

// GET /api/users/addresses
router.get('/addresses', protect, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id).select('addresses selectedAddress');
    res.json({ success: true, data: user.addresses, selectedAddress: user.selectedAddress });
  } catch (err) { next(err); }
});

// POST /api/users/addresses
router.post('/addresses', protect, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    const newAddress = { ...req.body };
    
    // If it's the first address, make it default
    if (user.addresses.length === 0) {
      newAddress.isDefault = true;
    } else if (newAddress.isDefault) {
      // Unset other defaults if this one is default
      user.addresses.forEach(a => a.isDefault = false);
    }
    
    user.addresses.push(newAddress);
    const savedAddress = user.addresses[user.addresses.length - 1];
    
    // Auto-select if none selected
    if (!user.selectedAddress) {
      user.selectedAddress = savedAddress._id;
    }
    
    await user.save();
    res.status(201).json({ success: true, data: savedAddress });
  } catch (err) { next(err); }
});

// PATCH /api/users/addresses/:id
router.patch('/addresses/:id', protect, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.id);
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });
    
    if (req.body.isDefault) {
      user.addresses.forEach(a => a.isDefault = false);
    }
    
    Object.assign(address, req.body);
    await user.save();
    res.json({ success: true, data: address });
  } catch (err) { next(err); }
});

// DELETE /api/users/addresses/:id
router.delete('/addresses/:id', protect, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    user.addresses.pull(req.params.id);
    
    if (user.selectedAddress && user.selectedAddress.toString() === req.params.id) {
      user.selectedAddress = user.addresses[0]?._id || null;
    }
    
    await user.save();
    res.json({ success: true, message: 'Address removed' });
  } catch (err) { next(err); }
});

// PATCH /api/users/select-address
router.patch('/select-address', protect, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const { addressId } = req.body;
    const user = await User.findById(req.user._id);
    
    const exists = user.addresses.id(addressId);
    if (!exists) return res.status(404).json({ success: false, message: 'Address not found' });
    
    user.selectedAddress = addressId;
    await user.save();
    res.json({ success: true, data: exists });
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
