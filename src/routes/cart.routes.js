const express   = require('express');
const router    = express.Router();
const Cart      = require('../models/Cart');
const Product   = require('../models/Product');
const Coupon    = require('../models/Coupon');
const { protect, optionalAuth } = require('../middleware/auth');

const getCartFilter = (req) =>
  req.user ? { user: req.user._id } : { sessionId: req.cookies?.sessionId };

// GET /api/cart
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const cart = await Cart.findOne(getCartFilter(req)).populate('items.product', 'name images price salePrice stock status');
    res.json({ success: true, data: cart || { items: [] } });
  } catch (err) { next(err); }
});

// POST /api/cart/add
router.post('/add', optionalAuth, async (req, res, next) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const product = await Product.findById(productId);
    if (!product || product.status !== 'active' || product.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Product unavailable or insufficient stock.' });
    }

    const filter = getCartFilter(req);
    let cart = await Cart.findOne(filter);
    if (!cart) cart = new Cart(filter);

    const idx = cart.items.findIndex((i) => i.product.toString() === productId);
    if (idx > -1) {
      cart.items[idx].quantity = Math.min(cart.items[idx].quantity + quantity, product.stock);
    } else {
      cart.items.push({ product: productId, quantity });
    }
    await cart.save();
    await cart.populate('items.product', 'name images price salePrice stock');
    res.json({ success: true, data: cart });
  } catch (err) { next(err); }
});

// PATCH /api/cart/update
router.patch('/update', optionalAuth, async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;
    const cart = await Cart.findOne(getCartFilter(req));
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found.' });

    if (quantity <= 0) {
      cart.items = cart.items.filter((i) => i.product.toString() !== productId);
    } else {
      const idx = cart.items.findIndex((i) => i.product.toString() === productId);
      if (idx > -1) cart.items[idx].quantity = quantity;
    }
    await cart.save();
    await cart.populate('items.product', 'name images price salePrice stock');
    res.json({ success: true, data: cart });
  } catch (err) { next(err); }
});

// DELETE /api/cart/remove/:productId
router.delete('/remove/:productId', optionalAuth, async (req, res, next) => {
  try {
    const cart = await Cart.findOne(getCartFilter(req));
    if (cart) {
      cart.items = cart.items.filter((i) => i.product.toString() !== req.params.productId);
      await cart.save();
    }
    res.json({ success: true, message: 'Item removed.' });
  } catch (err) { next(err); }
});

// POST /api/cart/coupon
router.post('/coupon', optionalAuth, async (req, res, next) => {
  try {
    const { code } = req.body;
    const coupon  = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon || (coupon.expiryDate && coupon.expiryDate < new Date())) {
      return res.status(400).json({ success: false, message: 'Invalid or expired coupon.' });
    }
    const cart = await Cart.findOne(getCartFilter(req)).populate('items.product', 'price salePrice');
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found.' });

    const subtotal = cart.items.reduce((sum, i) => sum + (i.product.salePrice || i.product.price) * i.quantity, 0);
    if (subtotal < coupon.minOrderAmount) {
      return res.status(400).json({ success: false, message: `Minimum order ₹${coupon.minOrderAmount} required.` });
    }

    let discount = coupon.type === 'percentage'
      ? (subtotal * coupon.value) / 100
      : coupon.value;
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);

    cart.couponCode = coupon.code;
    cart.discount   = Math.round(discount);
    await cart.save();
    res.json({ success: true, message: `Coupon applied! You save ₹${cart.discount}`, data: cart });
  } catch (err) { next(err); }
});

// DELETE /api/cart/coupon
router.delete('/coupon', optionalAuth, async (req, res, next) => {
  try {
    const cart = await Cart.findOne(getCartFilter(req));
    if (cart) { cart.couponCode = undefined; cart.discount = 0; await cart.save(); }
    res.json({ success: true, message: 'Coupon removed.' });
  } catch (err) { next(err); }
});

// DELETE /api/cart/clear
router.delete('/clear', optionalAuth, async (req, res, next) => {
  try {
    await Cart.findOneAndDelete(getCartFilter(req));
    res.json({ success: true, message: 'Cart cleared.' });
  } catch (err) { next(err); }
});

module.exports = router;
