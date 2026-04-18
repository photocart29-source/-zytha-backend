const mongoose = require('mongoose');

const vendorRequestSchema = new mongoose.Schema(
  {
    shopName: {
      type: String,
      required: [true, 'Shop name is required'],
      trim: true
    },
    category: {
      type: String,
      required: [true, 'Category is required']
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required']
    },
    message: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'contacted', 'rejected'],
      default: 'pending'
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('VendorRequest', vendorRequestSchema);
