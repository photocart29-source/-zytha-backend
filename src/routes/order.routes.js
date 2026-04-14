const express = require('express');
const router  = express.Router();
const Order   = require('../models/Order');
const Cart    = require('../models/Cart');
const Product = require('../models/Product');
const Coupon  = require('../models/Coupon');
const { protect, authorize } = require('../middleware/auth');
const { sendOrderConfirmationEmail } = require('../services/email.service');

// POST /api/orders — create order + Cashfree session
router.post('/', protect, async (req, res, next) => {
  try {
    const { shippingAddress: addressId, couponCode, paymentMethod = 'cashfree' } = req.body;
    
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

    // --- Online Payment Logic (Cashfree) ---
    if (paymentMethod === 'cashfree') {
      try {
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
            customer_phone: '9999999999', 
          },
          order_meta: {
            return_url: `${process.env.CLIENT_URL}/order-success?orderId=${order.orderId}`,
            notify_url: `${process.env.CLIENT_URL?.replace('4200', '5000') || 'http://localhost:5000'}/api/webhooks/cashfree`,
          },
        };

        const cfResponse = await Cashfree.PGCreateOrder('2023-08-01', cfRequest);
        const { payment_session_id, cf_order_id } = cfResponse.data;

        order.cashfreeOrderId   = cf_order_id;
        order.paymentSessionId  = payment_session_id;
        await order.save();

        if (couponCode) {
          await Coupon.findOneAndUpdate({ code: couponCode.toUpperCase() }, {
            $inc:  { usedCount: 1 },
            $push: { usedBy: { user: req.user._id } },
          });
        }

        return res.status(201).json({
          success: true,
          data: { orderId: order.orderId, paymentSessionId: payment_session_id, totalAmount, paymentMethod: 'online' },
        });
      } catch (cfErr) {
        console.error('Cashfree Error:', cfErr);
        // Fallback or delete order if payment init fails? 
        // For now, return order anyway but mark it as payment init failed
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
