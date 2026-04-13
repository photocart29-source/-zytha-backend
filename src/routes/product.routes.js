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

    // --- Filter out products from suspended vendors ---
    // If not searching for a specific vendor OR if user is not a vendor looking at their own products
    const isVendorViewingSelf = req.user && req.user.role === 'vendor';
    
    // Build aggregation pipeline to handle vendor status join
    const pipeline = [
      { $match: filter },
      // Join with Vendor collection (the collection name is usually 'vendors')
      {
        $lookup: {
          from: 'vendors',
          localField: 'vendor',
          foreignField: 'user',
          as: 'vendorDetails'
        }
      },
      // If product has a vendor, filter by their status
      {
        $match: {
          $or: [
            { vendorDetails: { $size: 0 } }, // In case some products don't have vendor docs yet
            { 'vendorDetails.status': { $ne: 'suspended' } },
            // If the requester is the vendor themselves, they should see their products even if suspended
            ...(isVendorViewingSelf ? [{ vendor: req.user._id }] : [])
          ]
        }
      }
    ];

    // Sorting
    const sortObj = {};
    if (sort) {
      const field = sort.startsWith('-') ? sort.substring(1) : sort;
      const order = sort.startsWith('-') ? -1 : 1;
      sortObj[field] = order;
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    // Execute aggregation for total count and paginated data
    const totalPipeline = [...pipeline, { $count: 'total' }];
    const totalResult = await Product.aggregate(totalPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    const productsPipeline = [
      ...pipeline,
      { $sort: sortObj },
      { $skip: skip },
      { $limit: Number(limit) }
    ];

    let products = await Product.aggregate(productsPipeline);
    
    // Populate manualy since aggregate doesn't support .populate()
    // We can also use $lookup for everything but .populate is cleaner for many refs
    products = await Product.populate(products, [
      { path: 'category', select: 'name slug' },
      { path: 'vendor', select: 'name' }
    ]);

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
