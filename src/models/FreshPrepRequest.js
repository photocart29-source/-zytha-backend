const mongoose = require('mongoose');

const freshPrepRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: [true, 'Product is required']
        },
        quantity: {
          type: Number,
          required: [true, 'Quantity is required'],
          min: [1, 'Quantity must be at least 1']
        }
      }
    ],
    phone: {
      type: String,
      required: [true, 'Phone number is required']
    },
    address: {
      type: String,
      required: [true, 'Address is required']
    },
    remarks: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'cancelled'],
      default: 'pending'
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Usually vendor is a user with role vendor
      required: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('FreshPrepRequest', freshPrepRequestSchema);
