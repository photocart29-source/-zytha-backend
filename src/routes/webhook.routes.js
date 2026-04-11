const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const Order   = require('../models/Order');
const Cart    = require('../models/Cart');
const { sendOrderConfirmationEmail } = require('../services/email.service');

/**
 * POST /api/webhooks/cashfree
 * Receives payment status update from Cashfree.
 * Body is raw (see server.js — raw body before json parse).
 * Verifies HMAC-SHA256 signature for security.
 */
router.post('/cashfree', async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const rawBody   = req.body.toString();   // Buffer → string (raw middleware)

    // ─── Verify HMAC signature ─────────────────────────────────────────────
    const signedPayload = `${timestamp}${rawBody}`;
    const expectedSig   = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
      .update(signedPayload)
      .digest('base64');

    if (signature !== expectedSig) {
      console.warn('❌ Cashfree webhook signature mismatch');
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody);
    const { type, data } = event;

    if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
      const cfOrderId = data?.order?.order_id;
      if (!cfOrderId) return res.sendStatus(200);

      const order = await Order.findOne({ orderId: cfOrderId }).populate('user', 'name email');
      if (!order) return res.sendStatus(200);

      if (order.paymentStatus !== 'paid') {
        order.paymentStatus        = 'paid';
        order.orderStatus          = 'confirmed';
        order.cashfreePaymentId    = data?.payment?.cf_payment_id;
        order.statusHistory.push({ status: 'confirmed', note: 'Payment received via Cashfree.' });
        await order.save();

        // Clear cart
        await Cart.findOneAndDelete({ user: order.user._id });

        // Send confirmation email
        sendOrderConfirmationEmail({
          to:      order.user.email,
          name:    order.user.name,
          orderId: order.orderId,
          total:   order.totalAmount,
          items:   order.items,
        }).catch(console.error);
      }
    }

    if (type === 'PAYMENT_FAILED_WEBHOOK') {
      const cfOrderId = data?.order?.order_id;
      const order = await Order.findOne({ orderId: cfOrderId });
      if (order && order.paymentStatus === 'pending') {
        order.paymentStatus = 'failed';
        order.statusHistory.push({ status: 'placed', note: 'Payment failed.' });
        await order.save();
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;
