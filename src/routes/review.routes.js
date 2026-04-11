const express = require('express');
const router  = express.Router();
const Review  = require('../models/Review');
const { protect, authorize } = require('../middleware/auth');

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

// POST /api/reviews
router.post('/', protect, async (req, res, next) => {
  try {
    const review = await Review.create({ ...req.body, user: req.user._id });
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
