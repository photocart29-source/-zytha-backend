const express = require('express');
const router  = express.Router();
const Vendor  = require('../models/Vendor');
const User    = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { sendVendorStatusEmail } = require('../services/email.service');
const slugify = require('slug');

// POST /api/vendors/apply — customer applies to be vendor
router.post('/apply', protect, async (req, res, next) => {
  try {
    const exists = await Vendor.findOne({ user: req.user._id });
    if (exists) return res.status(409).json({ success: false, message: 'You already have a vendor application.' });

    const body      = req.body;
    body.user       = req.user._id;
    body.storeSlug  = slugify(body.storeName, { lower: true });
    const vendor    = await Vendor.create(body);
    res.status(201).json({ success: true, data: vendor, message: 'Application submitted. We will review shortly.' });
  } catch (err) { next(err); }
});

// GET /api/vendors/me — vendor dashboard data
router.get('/me', protect, async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user._id });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found.' });
    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
});

// PATCH /api/vendors/me — update vendor profile
router.patch('/me', protect, authorize('vendor'), async (req, res, next) => {
  try {
    const vendor = await Vendor.findOneAndUpdate({ user: req.user._id }, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
});

// GET /api/vendors — all vendors (admin)
router.get('/', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const vendors = await Vendor.find(filter)
      .populate('user', 'name email')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort('-createdAt');
    const total = await Vendor.countDocuments(filter);
    res.json({ success: true, data: vendors, total });
  } catch (err) { next(err); }
});

// PATCH /api/vendors/:id/status — admin approves/suspends vendor
router.patch('/:id/status', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const vendor = await Vendor.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate('user', 'name email');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    // Update user role if approved
    if (status === 'approved') {
      await User.findByIdAndUpdate(vendor.user._id, { role: 'vendor' });
    }

    // Send email notification
    sendVendorStatusEmail({ to: vendor.user.email, name: vendor.user.name, status }).catch(console.error);

    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
});

module.exports = router;
