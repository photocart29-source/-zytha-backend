const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:    { type: String, required: true },
  image:   String,
  price:   { type: Number, required: true },
  quantity:{ type: Number, required: true, min: 1 },
});

const addressSchema = new mongoose.Schema({
  fullName:   { type: String, required: true },
  phone:      { type: String, required: true },
  line1:      { type: String, required: true },
  line2:      String,
  city:       { type: String, required: true },
  state:      { type: String, required: true },
  pincode:    { type: String, required: true },
  country:    { type: String, default: 'India' },
});

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: [orderItemSchema],
    shippingAddress: addressSchema,
    paymentMethod: {
      type: String,
      enum: ['cashfree'],
      default: 'cashfree',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    orderStatus: {
      type: String,
      enum: ['placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
      default: 'placed',
    },
    itemsTotal:    { type: Number, required: true },
    shippingCost:  { type: Number, default: 0 },
    discount:      { type: Number, default: 0 },
    couponCode:    String,
    totalAmount:   { type: Number, required: true },
    // Cashfree
    cashfreeOrderId:    String,
    cashfreePaymentId:  String,
    paymentSessionId:   String,
    // Tracking
    trackingNumber: String,
    courier:        String,
    statusHistory: [
      {
        status:    String,
        note:      String,
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    invoiceUrl: String,
    notes:      String,
  },
  { timestamps: true }
);

// ─── Auto-generate human-readable order ID ────────────────────────────────────
orderSchema.pre('save', function (next) {
  if (!this.orderId) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random    = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.orderId = `ZF-${timestamp}-${random}`;
  }
  next();
});

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ orderStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);
