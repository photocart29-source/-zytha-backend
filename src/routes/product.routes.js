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

    // --- FIX: Only exclude suspended vendors if any exist.
    // Previously, setting filter.vendor = { $nin: [] } was excluding all
    // products with no vendor (i.e., admin-created products).
    const isVendorViewingSelf = req.user && req.user.role === 'vendor';
    if (!isVendorViewingSelf && !filter.vendor) {
      const Vendor = require('../models/Vendor');
      const suspendedVendors = await Vendor.find({ status: 'suspended' }).select('user');
      const suspendedUserIds = suspendedVendors.map(v => v.user);
      if (suspendedUserIds.length > 0) {
        filter.vendor = { $nin: suspendedUserIds };
      }
      // If no suspended vendors, don't touch filter.vendor — allow ALL products including admin ones
    }

    // Sorting
    const sortObj = {};
    if (sort && sort !== 'random') {
      const field = sort.startsWith('-') ? sort.substring(1) : sort;
      const order = sort.startsWith('-') ? -1 : 1;
      sortObj[field] = order;
    }

    // Force sensible limits
    let finalLimit = Math.min(Math.max(Number(limit), 1), 100);
    const skip = (Number(page) - 1) * finalLimit;
    
    // Total count
    const total = await Product.countDocuments(filter);

    let products;
    if (sort === 'random') {
      // For random sort, we use aggregation with $sample
      // NOTE: Pagination is less stable with pure $sample, but good for discovery
      products = await Product.aggregate([
        { $match: filter },
        { $sample: { size: finalLimit } },
        { $project: { description: 0 } }
      ]);
      
      // Manually populate since aggregate doesn't do it as easily
      products = await Product.populate(products, [
        { path: 'category', select: 'name slug' },
        { path: 'vendor', select: 'name role storeName' }
      ]);

      // Optimization: Only return the first image for list view
      products = products.map(p => {
        if (p.images && p.images.length > 0) {
          p.images = [p.images[0]];
        }
        return p;
      });
    } else {
      products = await Product.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(finalLimit)
        .select('-description -variants')
        .populate('category', 'name slug')
        .populate('vendor', 'name role storeName');

      // Optimization: Only return the first image for list view to save BW
      products = products.map(p => {
        const obj = p.toObject();
        if (obj.images && obj.images.length > 0) {
          obj.images = [obj.images[0]];
        }
        return obj;
      });
    }

    res.json({ success: true, data: products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

// GET /api/products/:slug
router.get('/:slug', optionalAuth, async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug })
      .populate('category', 'name slug')
      .populate('vendor', 'name role storeName');
    
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
    const body = req.body;
    body.slug  = slugify(body.name, { lower: true });
    // FIX: Admin/superadmin act as the platform vendor.
    // Always assign creator's _id as vendor so products are visible in the shop.
    if (!body.vendor) body.vendor = req.user._id;
    const product = await Product.create(body);
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
