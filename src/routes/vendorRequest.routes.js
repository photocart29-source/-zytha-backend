const express = require('express');
const router = express.Router();
const VendorRequest = require('../models/VendorRequest');
const { protect, authorize } = require('../middleware/auth');
const adminRoles = ['admin', 'superadmin'];

// @desc    Submit a vendor request (Public)
// @route   POST /api/vendor-requests
router.post('/', async (req, res) => {
  try {
    const { shopName, category, phone, message } = req.body;
    
    const request = await VendorRequest.create({
      shopName,
      category,
      phone,
      message
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

// @desc    Get all vendor requests (Admin only)
// @route   GET /api/vendor-requests
router.get('/', protect, authorize(...adminRoles), async (req, res) => {
  try {
    const requests = await VendorRequest.find().sort({ createdAt: -1 });
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

// @desc    Mark request as read (Admin only)
// @route   PATCH /api/vendor-requests/:id/read
router.patch('/:id/read', protect, authorize(...adminRoles), async (req, res) => {
  try {
    const request = await VendorRequest.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );
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
