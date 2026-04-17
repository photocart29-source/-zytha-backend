const mongoose = require('mongoose');

// Need to match exactly what server does
require('dotenv').config({ path: '/Users/yovelr/Softrate/NUZIVA/zytha-foods/backend/.env' });


async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/zytha', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('Connected to DB');

  const Product = require('./src/models/Product');
  const User = require('./src/models/User');
  const Vendor = require('./src/models/Vendor');
  const Category = require('./src/models/Category');

  console.log('Fetching suspended IDs...');
  const suspended = await Vendor.find({ status: 'suspended' }).select('user').lean();
  console.log('Suspended', suspended.length);

  console.log('Fetching map (Users)...');
  const users = await User.find({ role: { $in: ['vendor', 'admin', 'superadmin'] } }).select('name role').lean();
  console.log('Users mapped', users.length);

  console.log('Fetching map (Categories)...');
  const categories = await Category.find({}).select('name slug').lean();
  console.log('Categories mapped', categories.length);

  const filter = { status: 'active' };

  console.log('Getting count...');
  const isFiltered = Object.keys(filter).length > 0;
  const total = isFiltered
      ? await Product.countDocuments(filter)
      : await Product.estimatedDocumentCount();
  console.log('Total:', total);

  console.log('Fetching products...');
  const sortObj = { createdAt: -1 };
  const skip = 0;
  const finalLimit = 12;

  const products = await Product.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(finalLimit)
        .select('-description -variants')
        .lean(); 

  console.log('Fetched products:', products.length);

  console.log('Script done');
  process.exit(0);
}

run().catch(console.error);
