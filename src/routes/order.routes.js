const express = require('express');
const router  = express.Router();
const Order   = require('../models/Order');
const Cart    = require('../models/Cart');
const Coupon  = require('../models/Coupon');
const { protect, authorize } = require('../middleware/auth');
const { sendOrderConfirmationEmail } = require('../services/email.service');

// POST /api/orders — create order + Cashfree session
router.post('/', protect, async (req, res, next) => {
  try {
    const { shippingAddress, couponCode } = req.body;
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product', 'name price salePrice stock status images');
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty.' });
    }

    let itemsTotal = 0;
    const orderItems = cart.items.map((i) => {
      const price = i.product.salePrice || i.product.price;
      itemsTotal += price * i.quantity;
      return {
        product:  i.product._id,
        vendor:   i.product.vendor,
        name:     i.product.name,
        image:    i.product.images?.[0]?.url,
        price,
        quantity: i.quantity,
      };
    });

    let discount = cart.discount || 0;
    const shippingCost = itemsTotal >= 500 ? 0 : 49; // Free shipping above ₹500
    const totalAmount  = itemsTotal - discount + shippingCost;

    // Create the order in DB (pending payment)
    const order = await Order.create({
      user:            req.user._id,
      items:           orderItems,
      shippingAddress,
      itemsTotal,
      shippingCost,
      discount,
      couponCode:      cart.couponCode,
      totalAmount,
      paymentStatus:   'pending',
      orderStatus:     'placed',
      statusHistory:   [{ status: 'placed', note: 'Order placed, awaiting payment.' }],
    });

    // Create Cashfree order
    const { Cashfree } = require('cashfree-pg');
    Cashfree.XClientId     = process.env.CASHFREE_APP_ID;
    Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
    Cashfree.XEnvironment  = process.env.CASHFREE_ENV === 'production'
      ? Cashfree.Environment.PRODUCTION
      : Cashfree.Environment.SANDBOX;

    const cfRequest = {
      order_amount:   totalAmount,
      order_currency: 'INR',
      order_id:       order.orderId,
      customer_details: {
        customer_id:    req.user._id.toString(),
        customer_email: req.user.email,
        customer_name:  req.user.name,
        customer_phone: '9999999999', // Optional – not mandated
      },
      order_meta: {
        return_url: `${process.env.CLIENT_URL}/order-success?orderId=${order.orderId}`,
        notify_url: `${process.env.CLIENT_URL?.replace('4200', '5000') || 'http://localhost:5000'}/api/webhooks/cashfree`,
      },
    };

    const cfResponse = await Cashfree.PGCreateOrder('2023-08-01', cfRequest);
    const { payment_session_id, cf_order_id } = cfResponse.data;

    // Save Cashfree IDs
    order.cashfreeOrderId   = cf_order_id;
    order.paymentSessionId  = payment_session_id;
    await order.save();

    // Increment coupon usage
    if (couponCode) {
      await Coupon.findOneAndUpdate({ code: couponCode.toUpperCase() }, {
        $inc:  { usedCount: 1 },
        $push: { usedBy: { user: req.user._id } },
      });
    }

    res.status(201).json({
      success: true,
      data: { orderId: order.orderId, paymentSessionId: payment_session_id, totalAmount },
    });
  } catch (err) { next(err); }
});

// GET /api/orders — Fetch orders based on role
router.get('/', protect, async (req, res, next) => {
  try {
    let filter = {};
    const { page = 1, limit = 10 } = req.query;

    if (req.user.role === 'vendor') {
      filter = { 'items.vendor': req.user._id };
    } else if (req.user.role === 'customer') {
      filter = { user: req.user._id };
    } // admin/superadmin sees everything

    let orders = await Order.find(filter)
      .populate('user', 'name email')
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .sort('-createdAt');

    // If vendor, only return their items and adjust totals
    if (req.user.role === 'vendor') {
      orders = orders.map(order => {
        const orderObj = order.toObject();
        orderObj.items = orderObj.items.filter(item => item.vendor.toString() === req.user._id.toString());
        // For vendors, the total shown should only be for their items
        orderObj.vendorTotal = orderObj.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        return orderObj;
      });
    }

    const total = await Order.countDocuments(filter);
    res.json({ success: true, data: orders, total, pages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

// GET /api/orders/:id
router.get('/:id', protect, async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id }).populate('user', 'name email');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    
    // Authorization check
    const isOwner = order.user._id.toString() === req.user._id.toString();
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const isVendor = req.user.role === 'vendor' && order.items.some(i => i.vendor.toString() === req.user._id.toString());

    if (!isOwner && !isAdmin && !isVendor) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    let orderData = order.toObject();
    if (req.user.role === 'vendor') {
      orderData.items = orderData.items.filter(i => i.vendor.toString() === req.user._id.toString());
      orderData.vendorTotal = orderData.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    }

    res.json({ success: true, data: orderData });
  } catch (err) { next(err); }
});

// PATCH /api/orders/:id/status — admin or vendor
router.patch('/:id/status', protect, authorize('vendor', 'admin', 'superadmin'), async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    // Vendor can only update IF it's their product
    if (req.user.role === 'vendor') {
      const hasOwnProduct = order.items.some(i => i.vendor.toString() === req.user._id.toString());
      if (!hasOwnProduct) return res.status(403).json({ success: false, message: 'Not authorized for this order.' });
    }

    order.orderStatus = status;
    order.statusHistory.push({ status, note: note || `Status updated to ${status}` });
    await order.save();
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

// GET /api/orders/track/:orderId — public order tracking
router.get('/track/:orderId', async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId }).select(
      'orderId orderStatus statusHistory trackingNumber courier shippingAddress.city shippingAddress.state'
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

module.exports = router;
