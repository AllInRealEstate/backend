const adminService = require('../services/adminService');
const socketService = require('../services/socket/socketService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { ERROR, SUCCESS } = require('../constants/ToastMessages');

// --- Helper: Send Token via Cookie ---
const sendTokenResponse = (admin, token, statusCode, res) => {
  const options = {
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  };

  const name = admin.workerProfile
    ? admin.workerProfile.translations?.en?.name
    : `${admin.firstName} ${admin.lastName}`;

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      admin: {
        id: admin._id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        name: name,
        role: admin.role,
        createdAt: admin.createdAt,
        workerProfile: admin.workerProfile || null
      }
    });
};

// --- Auth Controllers ---

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  const { admin, token } = await adminService.login(email, password);
  
  // Notify superadmins that an admin has logged in
  socketService.emitAdminLogin(admin._id, {
    email: admin.email,
    name: `${admin.firstName} ${admin.lastName}`,
    role: admin.role,
    timestamp: new Date()
  });
  
  sendTokenResponse(admin, token, 200, res);
});

exports.logout = (req, res) => {
  // ← ADD THIS BLOCK
  // Notify superadmins that an admin has logged out
  if (req.admin) {
    socketService.emitAdminLogout(req.admin._id, {
      email: req.admin.email,
      name: `${req.admin.firstName} ${req.admin.lastName}`,
      role: req.admin.role,
      timestamp: new Date()
    });
  }
  
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  };
  res.clearCookie('token', options);
  res.status(200).json({ success: true, message: SUCCESS.LOGOUT });
};

exports.register = catchAsync(async (req, res, next) => {
  const { admin, token } = await adminService.registerSuperAdmin(req.body);
  sendTokenResponse(admin, token, 201, res);
});

exports.getMe = catchAsync(async (req, res, next) => {
  // Check if requesting optimized version
  const optimized = req.path.includes('optimized');
  
  if (optimized) {
    const admin = await adminService.getMe(req.admin.id, true);
    return res.status(200).json({ success: true, admin });
  }

  const admin = await adminService.getMe(req.admin.id, false);
  // We reuse sendTokenResponse logic just to format the JSON consistently, 
  // but we don't need to set a new cookie, so we pass a dummy token or handle strictly.
  // Better to just return JSON here:
  
  const name = admin.workerProfile
    ? admin.workerProfile.translations?.en?.name
    : `${admin.firstName} ${admin.lastName}`;
    
  res.status(200).json({
      success: true,
      admin: {
        id: admin._id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        name: name,
        role: admin.role,
        createdAt: admin.createdAt,
        workerProfile: admin.workerProfile || null
      }
  });
});

// --- User Management Controllers ---

exports.getUsers = catchAsync(async (req, res, next) => {
  // If query params exist, assume paginated/optimized search
  const query = req.query;
  if (req.path.includes('optimized')) {
    query.optimized = true;
    const result = await adminService.getAdminUsers(query);
    return res.status(200).json({ success: true, ...result });
  }

  const users = await adminService.getAdminUsers({});
  res.status(200).json({ success: true, count: users.length, data: users });
});

exports.createUser = catchAsync(async (req, res, next) => {
  const newAdmin = await adminService.createAdmin(req.body);
  res.status(201).json({ success: true, data: newAdmin });
});

exports.getUserById = catchAsync(async (req, res, next) => {
  // We can reuse getMe logic or Service logic
  // Since getMe uses req.admin.id, we need a specific service call for ById
  const admin = await require('../models/Admin').findById(req.params.id)
      .select('-password -__v')
      .populate('workerProfile');
      
  if (!admin) return next(new AppError(ERROR.ADMIN_NOT_FOUND, 404));
  res.status(200).json({ success: true, data: admin });
});

exports.updateUser = catchAsync(async (req, res, next) => {
  const updatedAdmin = await adminService.updateAdmin(req.params.id, req.body);

  // ← MODIFIED BLOCK
  // Check if the update involves suspension, deactivation, or role change
  if (req.body.isActive === false || req.body.status === 'suspended' || req.body.role) {
    socketService.emitForceLogout(req.params.id, ERROR.FORCE_LOGOUT_UPDATED);
    
    // If specifically suspended, notify superadmins
    if (req.body.status === 'suspended' || req.body.isSuspended === true) {
      socketService.emitAdminSuspended(req.params.id, req.admin._id);
    }
  }

  res.status(200).json({ success: true, data: updatedAdmin });
});

exports.deleteUser = catchAsync(async (req, res, next) => {
  const result = await adminService.deleteAdmin(req.params.id, req.admin.id);
  
  socketService.emitForceLogout(req.params.id, ERROR.FORCE_LOGOUT_UPDATED);
  
  res.status(200).json({ success: true, data: {} });
});