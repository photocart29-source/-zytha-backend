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

// POST /api/vendors — Admin creates vendor
router.post('/', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const { name, email, password, storeName } = req.body;
    
    // 1. Create User
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ success: false, message: 'User with this email already exists.' });

    const user = await User.create({
      name,
      email,
      password,
      role: 'vendor',
      isEmailVerified: true
    });

    // 2. Create Vendor Profile
    const vendor = await Vendor.create({
      user: user._id,
      storeName,
      storeSlug: slugify(storeName, { lower: true }),
      status: 'approved' // Auto-approved when created by admin
    });

    res.status(201).json({ success: true, data: { user, vendor }, message: 'Vendor created successfully.' });
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

// GET /api/vendors/profile alias
router.get('/profile', protect, async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user._id });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found.' });
    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
});

// PUT /api/vendors/profile — update vendor profile
router.put('/profile', protect, authorize('vendor'), async (req, res, next) => {
  try {
    const updates = { ...req.body };
    
    // Auto-update slug if storeName changes
    if (updates.storeName) {
      updates.storeSlug = slugify(updates.storeName, { lower: true });
    }

    const vendor = await Vendor.findOneAndUpdate(
      { user: req.user._id }, 
      updates, 
      { new: true, runValidators: true }
    );
    
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found.' });
    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
});

const multer  = require('multer');
const storage = multer.memoryStorage();
const upload  = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// POST /api/vendors/banner — set store banner image
router.post('/banner', protect, authorize('vendor'), upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided.' });
    
    const base64Data = req.file.buffer.toString('base64');
    const url = `data:${req.file.mimetype};base64,${base64Data}`;

    const vendor = await Vendor.findOneAndUpdate(
       { user: req.user._id },
       { banner: { url, publicId: req.file.originalname } },
       { new: true }
    );
    
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });
    res.json({ success: true, data: vendor.banner });
  } catch (err) { next(err); }
});

// POST /api/vendors/logo — set store logo image
router.post('/logo', protect, authorize('vendor'), upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided.' });
    
    const base64Data = req.file.buffer.toString('base64');
    const url = `data:${req.file.mimetype};base64,${base64Data}`;

    const vendor = await Vendor.findOneAndUpdate(
       { user: req.user._id },
       { logo: { url, publicId: req.file.originalname } },
       { new: true }
    );
    
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });
    res.json({ success: true, data: vendor.logo });
  } catch (err) { next(err); }
});

module.exports = router;
