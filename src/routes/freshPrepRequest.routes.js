const express = require('express');
const router = express.Router();
const FreshPrepRequest = require('../models/FreshPrepRequest');
const { protect, authorize } = require('../middleware/auth');

const adminRoles = ['admin', 'superadmin'];

// @desc    Submit a FreshPrep (Bulk) request
// @route   POST /api/fresh-prep-requests
router.post('/', async (req, res) => {
  try {
    const { items, phone, address, remarks, user } = req.body;
    
    const request = await FreshPrepRequest.create({
      items,
      phone,
      address,
      remarks,
      user: user || null
    });

    res.status(201).json({
      success: true,
      data: request
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Get all FreshPrep requests (Admin only)
// @route   GET /api/fresh-prep-requests
router.get('/', protect, authorize(...adminRoles), async (req, res) => {
  try {
    const requests = await FreshPrepRequest.find()
      .populate('items.product', 'name price image')
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Update FreshPrep request status
// @route   PATCH /api/fresh-prep-requests/:id
router.patch('/:id', protect, authorize(...adminRoles, 'vendor'), async (req, res) => {
  try {
    const request = await FreshPrepRequest.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    res.status(200).json({
      success: true,
      data: request
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
