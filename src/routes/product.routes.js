const express  = require('express');
const mongoose = require('mongoose');
const router   = express.Router();
const Product  = require('../models/Product');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const slugify  = require('slug');

// Cache suspended vendor IDs — refresh every 5 minutes
// This prevents a DB query on EVERY product request
let suspendedVendorCache = { ids: [], lastFetched: 0 };

async function getSuspendedVendorIds() {
  const FIVE_MIN = 5 * 60 * 1000;
  if (Date.now() - suspendedVendorCache.lastFetched < FIVE_MIN) {
    return suspendedVendorCache.ids;
  }
  const Vendor = require('../models/Vendor');
  const suspended = await Vendor.find({ status: 'suspended' }).select('user').lean();
  suspendedVendorCache = { ids: suspended.map(v => v.user), lastFetched: Date.now() };
  return suspendedVendorCache.ids;
}

// In-Memory map cache for eliminating N+1 populate() queries!
let vendorCache = { map: {}, lastFetched: 0 };
let categoryCache = { map: {}, lastFetched: 0 };
const TEN_MIN = 10 * 60 * 1000;

async function getPopulateMaps() {
  const now = Date.now();
  if (now - vendorCache.lastFetched > TEN_MIN) {
    const User = require('../models/User'); // Product vendor refs User
    const vendors = await User.find({ role: { $in: ['vendor', 'admin', 'superadmin'] } }).select('name role').lean();
    vendorCache = {
      map: Object.fromEntries(vendors.map(v => [v._id.toString(), v])),
      lastFetched: now
    };
  }
  if (now - categoryCache.lastFetched > TEN_MIN) {
    const Category = require('../models/Category');
    const categories = await Category.find({}).select('name slug').lean();
    categoryCache = {
      map: Object.fromEntries(categories.map(c => [c._id.toString(), c])),
      lastFetched: now
    };
  }
  return { vMap: vendorCache.map, cMap: categoryCache.map };
}

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
      else if (status !== 'all')  filter.status = status;
    } else {
      filter.status = 'active';
    }
    if (category) filter.category = new mongoose.Types.ObjectId(category);
    if (brand)    filter.brand    = { $regex: brand, $options: 'i' };
    if (badge)    filter.badge    = badge;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (rating)  filter.ratingsAverage = { $gte: Number(rating) };
    if (search)  filter.$text = { $search: search };

    // Vendor isolation
    if (req.user && req.user.role === 'vendor') {
      filter.vendor = new mongoose.Types.ObjectId(req.user._id);
    } else if (req.query.vendor) {
      filter.vendor = new mongoose.Types.ObjectId(req.query.vendor);
    } else {
      // FIX 1: Use cache instead of hitting DB on every request
      const suspendedIds = await getSuspendedVendorIds();
      if (suspendedIds.length > 0) {
        filter.vendor = { $nin: suspendedIds };
      }
    }

    let numericLimit = Number(limit);

    console.log('[API] Check isFiltered');
    const isFiltered = Object.keys(filter).length > 0;
    
    console.log('[API] countDocuments start');
    const total = isFiltered
      ? await Product.countDocuments(filter)
      : await Product.estimatedDocumentCount();
    console.log('[API] countDocuments end', total);

    // If count-only request, return immediately — no product query needed
    if (numericLimit === 0) {
      return res.json({ success: true, data: [], total, page: 1, pages: 0 });
    }

    let finalLimit = Math.min(Math.max(numericLimit, 1), 100);
    const skip = (Number(page) - 1) * finalLimit;

    let products;
    console.log('[API] getPopulateMaps start');
    const { vMap, cMap } = await getPopulateMaps();
    console.log('[API] getPopulateMaps end');

    if (sort === 'random') {
      // FIX 3: Replace $sample with ID-based shuffle
      // Step 1: Fetch only _id fields — very fast, minimal memory
      const allIds = await Product.find(filter, '_id').lean();

      // Step 2: Fisher-Yates shuffle in JS, take only what we need
      for (let i = allIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allIds[i], allIds[j]] = [allIds[j], allIds[i]];
      }
      const selectedIds = allIds.slice(0, finalLimit).map(p => p._id);

      // Step 3: Fetch only those N products with full fields
      products = await Product.find({ _id: { $in: selectedIds } })
        .select({ description: 0, variants: 0, images: 0 })  // ← exclude images, thumbnailUrl serves the UI
        .lean();

      // Trim to first image only + manual memory join
      products = products.map(p => {
        if (p.category) p.category = cMap[p.category.toString()] || p.category;
        if (p.vendor)   p.vendor   = vMap[p.vendor.toString()]   || p.vendor;
        return p;
      });

    } else {
      const sortObj = {};
      const field = sort.startsWith('-') ? sort.substring(1) : sort;
      const order = sort.startsWith('-') ? -1 : 1;
      sortObj[field] = order;

      console.log('[API] find products start');
      products = await Product.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(finalLimit)
        .select({ description: 0, variants: 0, images: 0 })  // ← exclude images; use thumbnailUrl
        .lean(); // FIX 4: .lean() skips Mongoose document hydration — faster for read-only
      console.log('[API] find products end');

      products = products.map(p => {
        if (p.category) p.category = cMap[p.category.toString()] || p.category;
        if (p.vendor)   p.vendor   = vMap[p.vendor.toString()]   || p.vendor;
        return p;
      });
    }

    res.json({
      success: true, data: products, total,
      page: Number(page), pages: Math.ceil(total / finalLimit)
    });
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
