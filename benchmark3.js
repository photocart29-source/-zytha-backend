const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/yovelr/Softrate/NUZIVA/zytha-foods/backend/.env' });

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/zytha');
  const Product = require('./src/models/Product');
  const filter = { status: 'active' };

  console.log('\n══════════════════════════════════════════════════════');
  console.log(' FINAL BENCHMARK — thumbnailUrl vs old approaches');
  console.log('══════════════════════════════════════════════════════\n');

  // OLD approach (what was in production — caused 31s)
  console.log('[OLD] $slice: 1 in .select() — the previous approach');
  console.time('OLD_SliceImages');
  await Product.find(filter)
    .sort({ createdAt: -1 })
    .limit(12)
    .select({ description: 0, variants: 0, images: { $slice: 1 } })
    .lean();
  console.timeEnd('OLD_SliceImages');

  // NEW approach (images excluded entirely, thumbnailUrl is a plain string)
  console.log('\n[NEW] images: 0 + thumbnailUrl scalar field');
  console.time('NEW_ThumbnailUrl');
  const products = await Product.find(filter)
    .sort({ createdAt: -1 })
    .limit(12)
    .select({ description: 0, variants: 0, images: 0 })
    .lean();
  console.timeEnd('NEW_ThumbnailUrl');
  console.log(`    → ${products.length} products`);
  console.log(`    → thumbnailUrl[0]: ${products[0]?.thumbnailUrl?.substring(0, 60)}...`);

  console.log('\n══════════════════════════════════════════════════════');
  console.log(' DONE. Speedup = OLD / NEW');
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}
run().catch(err => { console.error(err.message); process.exit(1); });
