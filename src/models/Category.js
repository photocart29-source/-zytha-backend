const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true, unique: true },
    slug:        { type: String, required: true, lowercase: true, unique: true },
    description: String,
    image:       { url: String, publicId: String },
    parent:      { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    isActive:    { type: Boolean, default: true },
    sortOrder:   { type: Number, default: 0 },
    seoTitle:    String,
    seoDescription: String,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent',
});

categorySchema.index({ parent: 1 });

module.exports = mongoose.model('Category', categorySchema);
