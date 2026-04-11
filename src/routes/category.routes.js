const express  = require('express');
const router   = express.Router();
const Category = require('../models/Category');
const { protect, authorize } = require('../middleware/auth');

// GET /api/categories — public
router.get('/', async (req, res, next) => {
  try {
    const { parent } = req.query;
    const filter = parent === 'null' ? { parent: null } : parent ? { parent } : {};
    const cats = await Category.find(filter).sort('sortOrder').populate('children');
    res.json({ success: true, data: cats });
  } catch (err) { next(err); }
});

// GET /api/categories/:slug
router.get('/:slug', async (req, res, next) => {
  try {
    const cat = await Category.findOne({ slug: req.params.slug }).populate('children');
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found.' });
    res.json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// POST /api/categories — admin only
router.post('/', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const cat = await Category.create(req.body);
    res.status(201).json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// PUT /api/categories/:id
router.put('/:id', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// DELETE /api/categories/:id
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res, next) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Category deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
