const express = require('express');
const Razorpay = require('razorpay');
const router  = express.Router();
const Order   = require('../models/Order');
const Cart    = require('../models/Cart');
const Product = require('../models/Product');
const Coupon  = require('../models/Coupon');
const { protect, authorize } = require('../middleware/auth');
const { sendOrderConfirmationEmail } = require('../services/email.service');

// POST /api/orders — create order + Razorpay session
router.post('/', protect, async (req, res, next) => {
  try {
    const { shippingAddress: addressId, couponCode, paymentMethod = 'razorpay' } = req.body;
    
    // 1. Fetch Cart and User for full data
    const [cart, user] = await Promise.all([
      Cart.findOne({ user: req.user._id }).populate('items.product', 'name price salePrice stock status images vendor'),
      require('../models/User').findById(req.user._id)
    ]);

    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty.' });
    }

    // 2. Resolve Address object from ID
    const shippingAddress = user.addresses.id(addressId);
    if (!shippingAddress) {
      return res.status(400).json({ success: false, message: 'Invalid shipping address.' });
    }

    // 3. Map items and ensure vendor exists
    let itemsTotal = 0;
    const orderItems = cart.items.map((i) => {
      const price = i.product.salePrice || i.product.price;
      itemsTotal += price * i.quantity;
      return {
        product:  i.product._id,
        vendor:   i.product.vendor, // Now populated
        name:     i.product.name,
        image:    i.product.images?.[0]?.url,
        price,
        quantity: i.quantity,
      };
    });

    let discount = cart.discount || 0;
    const shippingCost = itemsTotal >= 500 ? 0 : 49; 
    const totalAmount  = itemsTotal - discount + shippingCost;

    // 4. Final Stock Validation before DB writes
    for (const i of cart.items) {
      if (i.product.stock < i.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${i.product.name}.` });
      }
    }

    const order = await Order.create({
      user:            req.user._id,
      items:           orderItems,
      shippingAddress: {
        fullName: shippingAddress.fullName,
        phone:    shippingAddress.phone,
        line1:    shippingAddress.line1 || shippingAddress.street, // Handle potential field naming diff
        line2:    shippingAddress.line2,
        city:     shippingAddress.city,
        state:    shippingAddress.state,
        pincode:  shippingAddress.pincode,
        country:  shippingAddress.country
      },
      itemsTotal,
      shippingCost,
      discount,
      paymentMethod,
      couponCode:      cart.couponCode,
      totalAmount,
      paymentStatus:   'pending',
      statusHistory:   [{ status: 'placed', note: paymentMethod === 'cod' ? 'Order placed via COD.' : 'Order placed, awaiting payment.' }],
    });

    // 5. Reduce Product Stock
    const stockUpdates = cart.items.map(i => ({
      updateOne: {
        filter: { _id: i.product._id },
        update: { $inc: { stock: -i.quantity } }
      }
    }));
    await Product.bulkWrite(stockUpdates);

    // --- Online Payment Logic (Razorpay) ---
    if (paymentMethod === 'razorpay') {
      try {
        const instance = new Razorpay({
          key_id:     process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const options = {
          amount:   Math.round(totalAmount * 100), // amount in paise
          currency: 'INR',
          receipt:  order.orderId,
        };

        const rzpOrder = await instance.orders.create(options);
        
        order.razorpayOrderId = rzpOrder.id;
        await order.save();

        if (couponCode) {
          await Coupon.findOneAndUpdate({ code: couponCode.toUpperCase() }, {
            $inc:  { usedCount: 1 },
            $push: { usedBy: { user: req.user._id } },
          });
        }

        return res.status(201).json({
          success: true,
          data: { 
            orderId: order.orderId, 
            razorpayOrderId: rzpOrder.id,
            amount: options.amount,
            currency: options.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            totalAmount, 
            paymentMethod: 'online',
            customer: {
              name: req.user.name,
              email: req.user.email,
              phone: shippingAddress.phone || '9999999999'
            }
          },
        });
      } catch (rzpErr) {
        console.error('Razorpay Error:', rzpErr);
        return res.status(200).json({ success: true, data: { orderId: order.orderId }, message: 'Order created but payment initiation failed.' });
      }
    }

    // --- COD Logic ---
    if (paymentMethod === 'cod') {
      if (couponCode) {
        await Coupon.findOneAndUpdate({ code: couponCode.toUpperCase() }, {
          $inc:  { usedCount: 1 },
          $push: { usedBy: { user: req.user._id } },
        });
      }
      return res.status(201).json({ success: true, data: { orderId: order.orderId, paymentMethod: 'cod' } });
    }
  } catch (err) { next(err); }
});

// GET /api/orders — Fetch orders based on role
router.get('/', protect, async (req, res, next) => {
  try {
    let filter = {};
    const { page = 1, limit = 50, vendor } = req.query;

    if (req.user.role === 'vendor') {
      // Vendors always see only their own items
      filter = { 'items.vendor': req.user._id };
    } else if (req.user.role === 'customer') {
      filter = { user: req.user._id };
    } else {
      // admin / superadmin: can filter by specific vendor
      // if vendor param is a specific ID, filter to that vendor's orders
      if (vendor && vendor !== 'all') {
        filter = { 'items.vendor': vendor };
      }
      // if vendor is 'all' or not provided → no filter (show everything)
    }

    let orders = await Order.find(filter)
      .populate('user', 'name email')
      .populate('items.vendor', 'name role')   // ← populate vendor name for dropdown
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .sort('-createdAt');

    // If vendor, only return their items and adjust totals
    if (req.user.role === 'vendor') {
      orders = orders.map(order => {
        const orderObj = order.toObject();
        orderObj.items = orderObj.items.filter(item => item.vendor?._id?.toString() === req.user._id.toString());
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

// POST /api/orders/verify — Verify Razorpay payment
router.post('/verify', protect, async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const crypto = require('crypto');
    
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature === razorpay_signature) {
      const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
      if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

      order.paymentStatus = 'paid';
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;
      order.orderStatus = 'confirmed';
      order.statusHistory.push({ status: 'confirmed', note: 'Payment verified via Razorpay.' });
      await order.save();
      
      // Clear Cart
      await Cart.findOneAndDelete({ user: req.user._id });
      
      // Send Confirmation Email
      try {
        await sendOrderConfirmationEmail(order);
      } catch (emailErr) {
        console.error('Email Error:', emailErr);
      }
      
      return res.json({ success: true, message: 'Payment verified successfully.', data: { orderId: order.orderId } });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid payment signature.' });
    }
  } catch (err) { next(err); }
});

module.exports = router;
