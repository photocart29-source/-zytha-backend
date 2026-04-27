const mongoose = require('mongoose');
const Product = require('./src/models/Product');
require('dotenv').config();

async function checkProducts() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/zytha-foods');
  const product = await Product.findOne({ status: 'active' }).lean();
  console.log('Sample Product Detail:', JSON.stringify(product, null, 2));
  process.exit(0);
}

checkProducts();
