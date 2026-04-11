const express = require('express');
const router  = express.Router();
const Coupon  = require('../models/Coupon');
const { protect, authorize } = require('../middleware/auth');

// GET /api/coupons — admin
router.get('/', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const coupons = await Coupon.find().sort('-createdAt');
    res.json({ success: true, data: coupons });
  } catch (err) { next(err); }
});

// POST /api/coupons/validate — public (validates before checkout)
router.post('/validate', async (req, res, next) => {
  try {
    const { code, orderAmount } = req.body;
    const coupon = await Coupon.findOne({ code: code?.toUpperCase(), isActive: true });
    if (!coupon || (coupon.expiryDate && coupon.expiryDate < new Date())) {
      return res.status(400).json({ success: false, message: 'Invalid or expired coupon.' });
    }
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached.' });
    }
    if (orderAmount < coupon.minOrderAmount) {
      return res.status(400).json({ success: false, message: `Minimum order ₹${coupon.minOrderAmount} required.` });
    }
    let discount = coupon.type === 'percentage' ? (orderAmount * coupon.value) / 100 : coupon.value;
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    res.json({ success: true, discount: Math.round(discount), coupon: { code: coupon.code, type: coupon.type, value: coupon.value } });
  } catch (err) { next(err); }
});

// POST /api/coupons — admin
router.post('/', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.status(201).json({ success: true, data: coupon });
  } catch (err) { next(err); }
});

// PUT /api/coupons/:id
router.put('/:id', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: coupon });
  } catch (err) { next(err); }
});

// DELETE /api/coupons/:id
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Coupon deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
