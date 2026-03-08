// createAdmin.js
const mongoose = require('mongoose');
const Admin = require('./models/Admin'); // Path to the Admin model you just shared
const dotenv = require('dotenv');

dotenv.config();

const createFirstAdmin = async () => {
  try {
    // 1. Connect to your LOCAL MongoDB
    // Use the URI from your logs: mongodb://localhost:27017/all_in
    await mongoose.connect('mongodb://localhost:27017/all_in');
    console.log('📡 Connected to Local MongoDB...');

    // 2. Define the new admin details
    const adminData = {
      firstName: 'Majd',
      lastName: 'Salameh',
      email: 'majd@test.com',
      password: '12345678', // Use a real password here
      role: 'superadmin' // Ensure this matches your ADMIN_ROLES.ADMIN constant
    };

    // 3. Create the user
    // The .pre('save') middleware in your model will handle the bcrypt hashing
    const newAdmin = await Admin.create(adminData);

    console.log('------------------------------------------------');
    console.log('✅ Admin Created Successfully!');
    console.log(`📧 Email: ${newAdmin.email}`);
    console.log('🔐 Password: [The one you typed above]');
    console.log('------------------------------------------------');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
};

createFirstAdmin();