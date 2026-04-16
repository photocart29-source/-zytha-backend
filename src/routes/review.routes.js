const express  = require('express');
const mongoose = require('mongoose');
const router   = express.Router();
const Review   = require('../models/Review');
const Order    = require('../models/Order');
const { protect } = require('../middleware/auth');

// GET /api/reviews/product/:productId
router.get('/product/:productId', async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const reviews = await Review.find({ product: req.params.productId, isApproved: true })
      .populate('user', 'name avatar')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort('-createdAt');
    const total = await Review.countDocuments({ product: req.params.productId, isApproved: true });
    res.json({ success: true, data: reviews, total });
  } catch (err) { next(err); }
});

// GET /api/reviews/can-review/:productId — check if user can review a product
router.get('/can-review/:productId', protect, async (req, res, next) => {
  try {
    const productId = new mongoose.Types.ObjectId(req.params.productId);
    const userId    = req.user._id;

    // Check if user has a delivered order containing this product
    const deliveredOrder = await Order.findOne({
      user: userId,
      orderStatus: 'delivered',
      'items.product': productId
    });

    if (!deliveredOrder) {
      return res.json({ success: true, canReview: false, reason: 'no_delivered_order' });
    }

    // Check if already reviewed
    const existing = await Review.findOne({ product: productId, user: userId });
    if (existing) {
      return res.json({ success: true, canReview: false, reason: 'already_reviewed', reviewId: existing._id });
    }

    res.json({ success: true, canReview: true });
  } catch (err) { next(err); }
});

// POST /api/reviews — only allow if the user has a delivered order with this product
router.post('/', protect, async (req, res, next) => {
  try {
    const { product: productId, rating, title, comment } = req.body;
    const userId = req.user._id;

    if (!productId || !rating) {
      return res.status(400).json({ success: false, message: 'Product and rating are required.' });
    }

    // Validate: user must have a delivered order containing this product
    const deliveredOrder = await Order.findOne({
      user: userId,
      orderStatus: 'delivered',
      'items.product': new mongoose.Types.ObjectId(productId)
    });

    if (!deliveredOrder) {
      return res.status(403).json({ success: false, message: 'You can only review products from delivered orders.' });
    }

    // Prevent duplicate reviews
    const existing = await Review.findOne({ product: productId, user: userId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You have already reviewed this product.' });
    }

    const review = await Review.create({ product: productId, rating, title, comment, user: userId, isApproved: true });
    res.status(201).json({ success: true, data: review });
  } catch (err) { next(err); }
});

// DELETE /api/reviews/:id
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });
    if (review.user.toString() !== req.user._id.toString() && !['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    await review.deleteOne();
    res.json({ success: true, message: 'Review deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
