const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
    },
    shortDescription: {
      type: String,
      maxlength: [500, 'Short description cannot exceed 500 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    salePrice: {
      type: Number,
      default: null,
    },
    images: [
      {
        url: { type: String, required: true },
        publicId: String,
        alt: String,
      },
    ],
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: false,
    },
    brand: {
      type: String,
      trim: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    stock: {
      type: Number,
      required: [true, 'Stock is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    sku: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    weight: Number,       // in grams
    unit: String,         // e.g. "500g", "1kg", "piece"
    tags: [String],
    status: {
      type: String,
      enum: ['active', 'inactive', 'out_of_stock'],
      default: 'active',
    },
    badge: {
      type: String,
      enum: ['new', 'sale', 'bestseller', 'flash_deal', null],
      default: null,
    },
    isBrandNew: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    ratingsAverage: {
      type: Number,
      default: 0,
      min: [0, 'Rating must be 0 or above'],
      max: [5, 'Rating must be 5 or below'],
      set: (val) => Math.round(val * 10) / 10,
    },
    ratingsCount: {
      type: Number,
      default: 0,
    },
    soldCount: {
      type: Number,
      default: 0,
    },
    seoTitle: String,
    seoDescription: String,
    variants: [
      {
        name: String,   // e.g. "500g", "1kg"
        price: Number,
        stock: Number,
        sku: String,
      },
    ],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// ─── Virtual: discount percentage ─────────────────────────────────────────────
productSchema.virtual('discountPercentage').get(function () {
  if (this.salePrice && this.price > this.salePrice) {
    return Math.round(((this.price - this.salePrice) / this.price) * 100);
  }
  return 0;
});

// ─── Virtual: effective price ──────────────────────────────────────────────────
productSchema.virtual('effectivePrice').get(function () {
  return this.salePrice || this.price;
});

// ─── Text index for search ─────────────────────────────────────────────────────
productSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ ratingsAverage: -1 });
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
