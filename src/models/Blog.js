const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true },
    content:     { type: String, required: true },
    excerpt:     String,
    coverImage:  { url: String, publicId: String },
    author:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category:    { type: String, trim: true },
    tags:        [String],
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
    viewCount:   { type: Number, default: 0 },
    seoTitle:    String,
    seoDescription: String,
  },
  { timestamps: true }
);

blogSchema.index({ isPublished: 1, publishedAt: -1 });
blogSchema.index({ title: 'text', content: 'text', tags: 'text' });

module.exports = mongoose.model('Blog', blogSchema);
