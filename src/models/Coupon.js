const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code:         { type: String, required: true, unique: true, uppercase: true, trim: true },
    type:         { type: String, enum: ['percentage', 'fixed'], required: true },
    value:        { type: Number, required: true },  // % or ₹ off
    minOrderAmount: { type: Number, default: 0 },
    maxDiscount:  Number,       // cap on percentage coupons
    usageLimit:   Number,       // total times it can be used
    usedCount:    { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1 },
    startDate:    Date,
    expiryDate:   Date,
    isActive:     { type: Boolean, default: true },
    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    applicableProducts:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product'  }],
    usedBy: [
      {
        user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);



module.exports = mongoose.model('Coupon', couponSchema);
