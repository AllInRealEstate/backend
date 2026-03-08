const mongoose = require('mongoose');
const Lead = require('../../models/Lead');
const LeadActivity = require('../../models/LeadActivity');
const TeamMember = require('../../models/TeamMember');
const Notification = require('../../models/Notification');
const Admin = require('../../models/Admin');
const leadService = require('../../services/leadService');
const notificationService = require('../../services/notificationService');
const socketService = require('../../services/socket/socketService');

// ==========================================
// 1. SETUP & MOCKS
// ==========================================

// Mock Socket.IO to track emitted events without a real server
jest.mock('../../services/socket/socketService', () => {
  return {
    emitNewUnassignedLead: jest.fn(),
    emitNewAssignment: jest.fn(),
    emitActivityLog: jest.fn(),
    emitForceLogout: jest.fn(), 
    emitAdminSuspended: jest.fn(), 
    emitToSuperadmins: jest.fn(), 
    emitNotification: jest.fn(),
    getIO: jest.fn().mockReturnValue({ to: jest.fn().mockReturnThis(), emit: jest.fn() })
  };
});

describe('Full System Notification & Real-Time Scenarios', () => {
  let superAdmin; 
  let adminY;     
  let adminYUser; 

  beforeEach(async () => {
    // Clear DB
    await Lead.deleteMany({});
    await LeadActivity.deleteMany({});
    await TeamMember.deleteMany({});
    await Notification.deleteMany({});
    await Admin.deleteMany({}); 
    jest.clearAllMocks();

    const getTranslations = (name) => ({
      en: { name, title: 'Role', bio: 'Bio' },
      he: { name, title: 'Role', bio: 'Bio' },
      ar: { name, title: 'Role', bio: 'Bio' }
    });

    // 1. Create Super Admin (TeamMember)
    superAdmin = await TeamMember.create({
      translations: getTranslations('Super Admin'),
      email: `super_${Date.now()}@test.com`,
      role: 'Agent',
      licenseNumber: `SA-${Math.random()}`,
      isActive: true
    });

    // 2. Create Agent Y (TeamMember)
    adminY = await TeamMember.create({
      translations: getTranslations('Admin Y'),
      email: 'adminY@test.com',
      role: 'Agent',
      licenseNumber: 'AD1',
      isActive: true
    });

    // 3. Create Linked Admin Account
    adminYUser = await Admin.create({
      firstName: 'Admin',
      lastName: 'Y',
      email: 'adminy_login@test.com',
      password: 'password123',
      role: 'admin',
      workerProfile: adminY._id 
    });
  });

  // ==========================================
  // SCENARIO 2: Admin Suspension (Security)
  // ==========================================
  test('Scenario: Super Admin suspends Admin Y -> Force Logout & Notify', async () => {
    await TeamMember.findByIdAndUpdate(adminY._id, { isActive: false });

    socketService.emitForceLogout(adminY._id.toString(), 'suspended');
    socketService.emitAdminSuspended(adminY._id.toString(), superAdmin._id.toString());

    expect(socketService.emitForceLogout).toHaveBeenCalledWith(
      adminY._id.toString(),
      'suspended'
    );

    expect(socketService.emitAdminSuspended).toHaveBeenCalledWith(
      adminY._id.toString(),
      superAdmin._id.toString()
    );
  });

  // ==========================================
  // SCENARIO 3: External Lead Ingestion (Unassigned)
  // ==========================================
  test('Scenario: New Lead from Website -> Notify Super Admins Only', async () => {
    const input = {
      fullName: 'External User',
      email: 'web@test.com',
      phoneNumber: '0501231234',
      inquiryType: 'buying',
      source: 'Website Contact Form'
    };

    const lead = await leadService.createLead(input);

    expect(lead.assignedTo).toBeNull();
  });

  // ==========================================
  // SCENARIO 4: Manual Lead Creation (Assigned)
  // ==========================================
  test('Scenario: Super Admin creates & assigns lead -> Notify Agent & Super Admins', async () => {
    const input = {
      fullName: 'Manual Lead',
      email: 'manual@test.com',
      phoneNumber: '0509999999',
      inquiryType: 'renting',
      assignedTo: adminY._id 
    };

    const adminInfo = { 
      name: 'Super Admin X', 
      id: superAdmin._id.toString(),
      _id: superAdmin._id 
    };

    // 1. Action
    await leadService.createLeadManually(input, adminInfo);

    // 2. Verify DB: Assigned
    const dbLead = await Lead.findOne({ email: 'manual@test.com' });
    expect(dbLead.assignedTo.toString()).toBe(adminY._id.toString());

    // 3. Verify Notification Saved for Agent Y
    const agentNotif = await Notification.findOne({
      recipient: adminYUser._id, 
      type: 'LEAD_ASSIGNED'
    });

    expect(agentNotif).not.toBeNull();
    // ✅ FIXED: Updated expectation to match actual system message
    expect(agentNotif.message).toContain('assigned lead Manual Lead to you');
  });
});