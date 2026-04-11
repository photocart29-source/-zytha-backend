const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  variant:  { name: String, price: Number },
});

const cartSchema = new mongoose.Schema(
  {
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },
    sessionId:  String,   // for guest carts
    items:      [cartItemSchema],
    couponCode: String,
    discount:   { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

cartSchema.virtual('itemCount').get(function () {
  return this.items.reduce((acc, item) => acc + item.quantity, 0);
});

cartSchema.index({ sessionId: 1 });

module.exports = mongoose.model('Cart', cartSchema);
