const express  = require('express');
const router   = express.Router();
const Order    = require('../models/Order');
const Product  = require('../models/Product');
const User     = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(protect, authorize('admin', 'superadmin'));

// GET /api/admin/stats — dashboard summary
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalOrders,
      totalRevenue,
      totalProducts,
      totalUsers,
      totalVendors,
      pendingOrders,
      recentOrders,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Product.countDocuments({ status: 'active' }),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'vendor' }),
      Order.countDocuments({ orderStatus: 'placed' }),
      Order.find().populate('user', 'name email').sort('-createdAt').limit(10),
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalProducts,
        totalUsers,
        totalVendors,
        pendingOrders,
        recentOrders,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/admin/revenue-chart — monthly revenue for current year
router.get('/revenue-chart', async (req, res, next) => {
  try {
    const year = new Date().getFullYear();
    const data = await Order.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          createdAt: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) },
        },
      },
      { $group: { _id: { month: { $month: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      { $sort: { '_id.month': 1 } },
    ]);
    res.json({ success: true, data, year });
  } catch (err) { next(err); }
});

// GET /api/admin/top-products
router.get('/top-products', async (req, res, next) => {
  try {
    const products = await Product.find({ status: 'active' })
      .sort('-soldCount -ratingsAverage')
      .limit(10)
      .select('name images price salePrice soldCount ratingsAverage');
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
});

module.exports = router;
