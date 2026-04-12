const express  = require('express');
const router   = express.Router();
const Wishlist = require('../models/Wishlist');
const { optionalAuth } = require('../middleware/auth');

const getWishlistFilter = (req) => {
  if (req.user) return { user: req.user._id };
  if (req.cookies?.sessionId) return { sessionId: String(req.cookies.sessionId) };
  return { _id: null };
};

// GET /api/wishlist
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne(getWishlistFilter(req)).populate('products', 'name slug images price salePrice stock ratingsAverage badge');
    res.json({ success: true, data: wishlist || { products: [] } });
  } catch (err) { next(err); }
});

// POST /api/wishlist/:productId
router.post('/:productId', optionalAuth, async (req, res, next) => {
  try {
    const filter = getWishlistFilter(req);
    let wishlist = await Wishlist.findOne(filter);
    if (!wishlist) wishlist = new Wishlist({ ...filter, products: [] });
    if (!wishlist.products.includes(req.params.productId)) {
      wishlist.products.push(req.params.productId);
      await wishlist.save();
    }
    res.json({ success: true, message: 'Added to wishlist.' });
  } catch (err) { next(err); }
});

// DELETE /api/wishlist/:productId
router.delete('/:productId', optionalAuth, async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne(getWishlistFilter(req));
    if (wishlist) {
      wishlist.products = wishlist.products.filter((p) => p.toString() !== req.params.productId);
      await wishlist.save();
    }
    res.json({ success: true, message: 'Removed from wishlist.' });
  } catch (err) { next(err); }
});

module.exports = router;
