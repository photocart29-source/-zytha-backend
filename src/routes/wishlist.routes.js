const express  = require('express');
const router   = express.Router();
const Wishlist = require('../models/Wishlist');
const { protect } = require('../middleware/auth');

// GET /api/wishlist
router.get('/', protect, async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id }).populate('products', 'name slug images price salePrice ratingsAverage badge');
    res.json({ success: true, data: wishlist || { products: [] } });
  } catch (err) { next(err); }
});

// POST /api/wishlist/:productId
router.post('/:productId', protect, async (req, res, next) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) wishlist = new Wishlist({ user: req.user._id, products: [] });
    if (!wishlist.products.includes(req.params.productId)) {
      wishlist.products.push(req.params.productId);
      await wishlist.save();
    }
    res.json({ success: true, message: 'Added to wishlist.' });
  } catch (err) { next(err); }
});

// DELETE /api/wishlist/:productId
router.delete('/:productId', protect, async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (wishlist) {
      wishlist.products = wishlist.products.filter((p) => p.toString() !== req.params.productId);
      await wishlist.save();
    }
    res.json({ success: true, message: 'Removed from wishlist.' });
  } catch (err) { next(err); }
});

module.exports = router;
