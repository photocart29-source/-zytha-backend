const express  = require('express');
const mongoose = require('mongoose');
const router   = express.Router();
const Product  = require('../models/Product');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const slugify  = require('slug');

// GET /api/products
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const {
      page = 1, limit = 12, category, brand, minPrice, maxPrice,
      rating, status = 'active', sort = '-createdAt', search, badge,
    } = req.query;

    const filter = {};
    if (status) {
      if (status === 'low_stock') filter.stock = { $gt: 0, $lte: 10 };
      else if (status !== 'all')   filter.status = status;
    } else {
      filter.status = 'active';
    }
    if (category) filter.category = new mongoose.Types.ObjectId(category);
    if (brand)    filter.brand    = { $regex: brand, $options: 'i' };
    if (badge)    filter.badge    = badge;
    
    // Vendor isolation / explicitly selected vendor
    if (req.user && req.user.role === 'vendor') {
      filter.vendor = new mongoose.Types.ObjectId(req.user._id);
    } else if (req.query.vendor) {
      filter.vendor = new mongoose.Types.ObjectId(req.query.vendor);
    }
    
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (rating)   filter.ratingsAverage = { $gte: Number(rating) };
    if (search)   filter.$text = { $search: search };

    // --- Optimized: Filter suspended vendors without aggregation ---
    const isVendorViewingSelf = req.user && req.user.role === 'vendor';
    if (!isVendorViewingSelf) {
      const Vendor = require('../models/Vendor');
      const suspendedVendors = await Vendor.find({ status: 'suspended' }).select('user');
      const suspendedUserIds = suspendedVendors.map(v => v.user);
      if (suspendedUserIds.length > 0) {
        filter.vendor = { $nin: suspendedUserIds };
      }
    }

    // Sorting
    const sortObj = {};
    if (sort) {
      const field = sort.startsWith('-') ? sort.substring(1) : sort;
      const order = sort.startsWith('-') ? -1 : 1;
      sortObj[field] = order;
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    // Total count using standard find() - much faster than aggregate
    const total = await Product.countDocuments(filter);

    // Fetch products using standard find() with projection for better performance
    let products = await Product.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(Number(limit))
      .select('-description') // Exclude heavy description
      .populate('category', 'name slug')
      .populate('vendor', 'name');

    res.json({ success: true, data: products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

// GET /api/products/:slug
router.get('/:slug', optionalAuth, async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug })
      .populate('category', 'name slug')
      .populate('vendor', 'name');
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    // Check if vendor is suspended
    const Vendor = require('../models/Vendor');
    const vendorDoc = await Vendor.findOne({ user: product.vendor._id });
    
    const isVendorViewingSelf = req.user && req.user.role === 'vendor' && req.user._id.toString() === product.vendor._id.toString();
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'superadmin');

    if (vendorDoc && vendorDoc.status === 'suspended' && !isVendorViewingSelf && !isAdmin) {
      return res.status(403).json({ success: false, message: 'This product is currently unavailable.' });
    }

    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

// POST /api/products — vendor or admin
router.post('/', protect, authorize('vendor', 'admin', 'superadmin'), async (req, res, next) => {
  try {
    const body     = req.body;
    body.slug      = slugify(body.name, { lower: true });
    if (req.user.role === 'vendor') body.vendor = req.user._id;
    const product  = await Product.create(body);
    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
});

// PUT /api/products/:id
router.put('/:id', protect, authorize('vendor', 'admin', 'superadmin'), async (req, res, next) => {
  try {
    let product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    // Vendor can only update their own
    if (req.user.role === 'vendor' && product.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized for this product.' });
    }

    product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

// DELETE /api/products/:id
router.delete('/:id', protect, authorize('vendor', 'admin', 'superadmin'), async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    // Vendor check
    if (req.user.role === 'vendor' && product.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized for this product.' });
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
