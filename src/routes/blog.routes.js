const express = require('express');
const router  = express.Router();
const Blog    = require('../models/Blog');
const { protect, authorize } = require('../middleware/auth');
const slugify = require('slug');

// GET /api/blogs
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 9, category, tag, search } = req.query;
    const filter = { isPublished: true };
    if (category) filter.category = category;
    if (tag)      filter.tags     = tag;
    if (search)   filter.$text    = { $search: search };
    const blogs = await Blog.find(filter)
      .populate('author', 'name avatar')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort('-publishedAt');
    const total = await Blog.countDocuments(filter);
    res.json({ success: true, data: blogs, total, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// GET /api/blogs/:slug
router.get('/:slug', async (req, res, next) => {
  try {
    const blog = await Blog.findOneAndUpdate(
      { slug: req.params.slug, isPublished: true },
      { $inc: { viewCount: 1 } },
      { new: true }
    ).populate('author', 'name avatar');
    if (!blog) return res.status(404).json({ success: false, message: 'Blog post not found.' });
    res.json({ success: true, data: blog });
  } catch (err) { next(err); }
});

// POST /api/blogs — admin only
router.post('/', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const body = req.body;
    body.slug   = slugify(body.title, { lower: true });
    body.author = req.user._id;
    if (body.isPublished && !body.publishedAt) body.publishedAt = new Date();
    const blog = await Blog.create(body);
    res.status(201).json({ success: true, data: blog });
  } catch (err) { next(err); }
});

// PUT /api/blogs/:id
router.put('/:id', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const blog = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: blog });
  } catch (err) { next(err); }
});

// DELETE /api/blogs/:id
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    await Blog.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Blog deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
