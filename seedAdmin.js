require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

async function seedAdmin() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB for seeding...');

    // Check if admin already exists
    const adminExists = await User.findOne({ email: 'admin@zythafoods.com' });
    
    if (adminExists) {
      console.log('⚠️ Admin user already exists!');
      console.log('Email: admin@zythafoods.com');
      process.exit(0);
    }

    // Create new admin
    const adminUser = new User({
      name: 'System Admin',
      email: 'admin@zythafoods.com',
      password: 'AdminPassword123',
      role: 'superadmin',
      isEmailVerified: true
    });

    await adminUser.save();
    console.log('🎉 Superadmin created successfully!');
    console.log('Email: admin@zythafoods.com');
    console.log('Password: AdminPassword123');
    
  } catch (err) {
    console.error('❌ Error creating admin:', err.message);
  } finally {
    process.exit(0);
  }
}

seedAdmin();
