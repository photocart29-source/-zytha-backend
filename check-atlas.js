const mongoose = require('mongoose');

async function checkProducts() {
  try {
    const MONGO_URI = 'mongodb+srv://yovel4002_db_user:T4AUZBzhl7OSIIod@nuziva.8e7vepd.mongodb.net/zytha-foods?retryWrites=true&w=majority';
    await mongoose.connect(MONGO_URI);
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
