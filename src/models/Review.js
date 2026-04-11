const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    rating:  { type: Number, required: true, min: 1, max: 5 },
    title:   { type: String, trim: true, maxlength: 100 },
    comment: { type: String, required: true, maxlength: 1000 },
    images:  [{ url: String, publicId: String }],
    isApproved: { type: Boolean, default: true },
    helpfulVotes: { type: Number, default: 0 },
    reportedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// One review per user per product
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// Update product ratings after save/delete
reviewSchema.post('save', async function () {
  const Product = mongoose.model('Product');
  const stats = await mongoose.model('Review').aggregate([
    { $match: { product: this.product, isApproved: true } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  if (stats.length > 0) {
    await Product.findByIdAndUpdate(this.product, {
      ratingsAverage: stats[0].avg,
      ratingsCount:   stats[0].count,
    });
  }
});

reviewSchema.post('findOneAndDelete', async function (doc) {
  if (!doc) return;
  const Product = mongoose.model('Product');
  const stats = await mongoose.model('Review').aggregate([
    { $match: { product: doc.product, isApproved: true } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Product.findByIdAndUpdate(doc.product, {
    ratingsAverage: stats.length > 0 ? stats[0].avg : 0,
    ratingsCount:   stats.length > 0 ? stats[0].count : 0,
  });
});

module.exports = mongoose.model('Review', reviewSchema);
