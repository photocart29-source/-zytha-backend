const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
  {
    user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    storeName:    { type: String, required: true, trim: true },
    storeSlug:    { type: String, lowercase: true, unique: true },
    description:  String,
    phone:        String,
    logo:         { url: String, publicId: String },
    banner:       { url: String, publicId: String },
    status:       { type: String, enum: ['pending', 'approved', 'suspended'], default: 'pending' },
    gstNumber:    String,
    panNumber:    String,
    bankDetails: {
      accountName:   String,
      accountNumber: String,
      ifscCode:      String,
      bankName:      String,
      upiId:         String,
    },
    address: {
      line1:   String,
      line2:   String,
      city:    String,
      state:   String,
      pincode: String,
      country: { type: String, default: 'India' }
    },
    commission: { type: Number, default: 10 }, // % platform fee
    rating:     { type: Number, default: 0 },
    totalSales: { type: Number, default: 0 },
  },
  { timestamps: true }
);

vendorSchema.index({ status: 1 });

module.exports = mongoose.model('Vendor', vendorSchema);
