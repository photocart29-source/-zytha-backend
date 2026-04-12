const express  = require('express');
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

    const filter = { status };
    if (category) filter.category = category;
    if (brand)    filter.brand    = { $regex: brand, $options: 'i' };
    if (badge)    filter.badge    = badge;
    
    // Vendor isolation / explicitly selected vendor
    if (req.user && req.user.role === 'vendor') {
      filter.vendor = req.user._id;
    } else if (req.query.vendor) {
      filter.vendor = req.query.vendor;
    }
    
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (rating)   filter.ratingsAverage = { $gte: Number(rating) };
    if (search)   filter.$text = { $search: search };

    const skip     = (Number(page) - 1) * Number(limit);
    const products = await Product.find(filter)
      .populate('category', 'name slug')
      .populate('vendor', 'name')
      .skip(skip)
      .limit(Number(limit))
      .sort(sort);
    const total    = await Product.countDocuments(filter);

    res.json({ success: true, data: products, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// GET /api/products/:slug
router.get('/:slug', optionalAuth, async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug })
      .populate('category', 'name slug')
      .populate('vendor', 'name');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
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
