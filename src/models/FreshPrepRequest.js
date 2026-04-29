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
          min: [0, 'Quantity must be at least 0']
        },
        unit: {
          type: String,
          default: 'kg'
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
    // Extended fields for professional bulk ordering
    businessName: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    orderReference: { type: String, default: '' },
    deliveryType: { type: String, enum: ['Standard', 'Express', 'Pickup', 'Scheduled'], default: 'Standard' },
    deliveryDate: { type: Date },
    alternatePhone: { type: String, default: '' },

    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'cancelled'],
      default: 'pending'
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('FreshPrepRequest', freshPrepRequestSchema);
