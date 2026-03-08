const Admin = require('../models/Admin');
const TeamMember = require('../models/TeamMember');
const AppError = require('../utils/AppError');
const { ERROR, SUCCESS } = require('../constants/ToastMessages');

class AdminService {
  
  /**
   * Helper: Check if TeamMember exists
   */
  async validateWorkerProfile(workerId) {
    if (!workerId) return null;
    const worker = await TeamMember.findById(workerId);
    if (!worker) throw new AppError('Invalid workerProfile ID - TeamMember not found', 400);
    return workerId;
  }

  /**
   * 1. Login
   */
  async login(email, password) {
    // Check for email and password
    if (!email || !password) {
      throw new AppError(ERROR.MISSING_CREDENTIALS, 400);
    }

    // Check user & password (password is unselected by default)
    const admin = await Admin.findOne({ email }).select('+password').populate('workerProfile');

if (!admin || !(await admin.matchPassword(password))) {
      throw new AppError(ERROR.INVALID_CREDENTIALS, 401);
    }

    // --- SECURITY CHECK ---
    if (admin.isSuspended) {
      throw new AppError('Your account has been suspended. Contact Super Admin.', 403);
    }

    // Increment token version to invalidate old sessions
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    // Update login activity
    admin.lastActive = Date.now();
    await admin.save();

    const token = admin.getSignedJwtToken();
    return { admin, token };
  }

  /**
   * 2. Register (Superadmin Setup)
   */
  async registerSuperAdmin(data) {
    // Security Check: Only allow one superadmin via this public route
    const adminCount = await Admin.countDocuments({ role: 'superadmin' });
    if (adminCount > 0) {
      throw new AppError('Registration is closed. A Superadmin user already exists.', 403);
    }

    const admin = await Admin.create({
      firstName: data.firstName || 'Super',
      lastName: data.lastName || 'Admin',
      email: data.email,
      password: data.password,
      role: 'superadmin'
    });

    const token = admin.getSignedJwtToken();
    return { admin, token };
  }

  /**
   * 3. Get Current Admin (Me)
   */
  async getMe(adminId, optimized = false) {
    if (optimized) {
      const admin = await Admin.getOptimizedProfile(adminId);
      if (!admin) throw new AppError('Admin not found', 404);
      return admin;
    }

    const admin = await Admin.findById(adminId).populate('workerProfile');
    if (!admin) throw new AppError('Admin not found', 404);
    return admin;
  }

  /**
   * 4. Create Admin (By Superadmin)
   */
  async createAdmin(data) {
    // Validate Worker Profile
    if (data.workerProfile) {
      await this.validateWorkerProfile(data.workerProfile);
    }

    const newAdmin = await Admin.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      role: data.role || 'admin',
      password: data.password,
      workerProfile: data.workerProfile || null
    });

    // Populate for return
    return await Admin.findById(newAdmin._id).select('-password').populate('workerProfile');
  }

  /**
   * 5. Update Admin
   */
  async updateAdmin(id, data) {
    // Validate Worker Profile if changed
    if (data.workerProfile) {
      await this.validateWorkerProfile(data.workerProfile);
    }

    // Separate password from other updates
    const { password, ...otherUpdates } = data;

    // Update basic fields
    const admin = await Admin.findByIdAndUpdate(id, otherUpdates, {
      new: true,
      runValidators: true,
      select: '-password'
    }).populate('workerProfile');

    if (!admin) throw new AppError(`Admin with ID ${id} not found`, 404);

    // Handle password update manually to trigger hashing hook
    if (password) {
      admin.password = password;
      await admin.save(); // Triggers pre-save hook in Model
    }

    return admin;
  }

  /**
   * 6. Delete Admin
   */
  async deleteAdmin(targetId, currentAdminId) {
    // Prevent suicide (Superadmin deleting themselves)
    if (targetId.toString() === currentAdminId.toString()) {
      throw new AppError('Cannot delete your own superadmin account', 403);
    } 

    const admin = await Admin.findByIdAndDelete(targetId);
    if (!admin) throw new AppError(`Admin with ID ${targetId} not found`, 404);
    
    return { message: 'Admin deleted successfully' };
  }

  /**
   * 7. Get All Users (Paginated & Searchable)
   */
  async getAdminUsers(query) {
    // If "optimized/all" logic is requested
    if (query.optimized) {
       return await Admin.getOptimizedAdmins(query);
    }
    
    // Legacy simple list
    return await Admin.find().select('-password -__v').populate('workerProfile');
  }
}

module.exports = new AdminService();