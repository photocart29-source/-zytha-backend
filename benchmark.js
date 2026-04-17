const mongoose = require('mongoose');

// Need to match exactly what server does
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zytha', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('Connected to DB');

  const Product = require('./src/models/Product');
  const User = require('./src/models/User');
  const Vendor = require('./src/models/Vendor');
  const Category = require('./src/models/Category');

  console.time('countDocuments');
  await Product.countDocuments({ status: 'active' });
  console.timeEnd('countDocuments');

  console.time('suspendedVendors');
  await Vendor.find({ status: 'suspended' }).select('user').lean();
  console.timeEnd('suspendedVendors');

  console.time('users');
  await User.find({ role: { $in: ['vendor', 'admin', 'superadmin'] } }).select('name role').lean();
  console.timeEnd('users');

  console.time('categories');
  await Category.find({}).select('name slug').lean();
  console.timeEnd('categories');

  console.time('productsFind');
  const products = await Product.find({ status: 'active' })
        .sort({ createdAt: -1 })
        .skip(0)
        .limit(12)
        .select('-description -variants')
        .lean();
  console.timeEnd('productsFind');

  console.log('Script done');
  process.exit(0);
}

run().catch(console.error);
