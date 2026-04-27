const mongoose = require('mongoose');

async function checkProducts() {
  try {
    await mongoose.connect('mongodb://localhost:27017/zytha-foods');
    const Product = mongoose.model('Product', new mongoose.Schema({ name: String, status: String }));
    const products = await Product.find({ status: 'active' });
    console.log('Active Products:', products.length);
    products.forEach(p => console.log('- ' + p.name));
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkProducts();
