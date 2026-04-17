/**
 * migrate-thumbnails.js
 * One-time migration: backfill `thumbnailUrl` using MongoDB aggregation pipeline update.
 * Single bulk operation — extremely fast regardless of collection size.
 *
 * Usage: node migrate-thumbnails.js
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/yovelr/Softrate/NUZIVA/zytha-foods/backend/.env' });

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/zytha');
  console.log('Connected. Running bulk thumbnail migration...\n');

  const db = mongoose.connection.db;
  const collection = db.collection('products');

  // Single aggregation pipeline update — MongoDB sets thumbnailUrl = images[0].url server-side
  // No round trips per document. This is O(1) network, O(n) server-side.
  const result = await collection.updateMany(
    {},  // all products
    [
      {
        $set: {
          thumbnailUrl: {
            $cond: {
              if: { $gt: [{ $size: { $ifNull: ['$images', []] } }, 0] },
              then: { $arrayElemAt: ['$images.url', 0] },
              else: null,
            },
          },
        },
      },
    ]
  );

  console.log(`✅ Bulk migration complete!`);
  console.log(`   Matched:  ${result.matchedCount} products`);
  console.log(`   Modified: ${result.modifiedCount} products (thumbnailUrl set/cleared)`);

  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
