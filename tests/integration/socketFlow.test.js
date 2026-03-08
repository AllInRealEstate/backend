/**
 * tests/integration/socketFlow.test.js
 * ✅ FIXED: Password length validation (min 6 chars)
 */

const mongoose = require('mongoose');
const Lead = require('../../models/Lead');
const TeamMember = require('../../models/TeamMember');
const Admin = require('../../models/Admin');
const Notification = require('../../models/Notification');
const leadService = require('../../services/leadService');
const notificationService = require('../../services/notificationService');

// 1. ROBUST MOCK
jest.mock('../../services/socket/socketService', () => ({
  emitNewUnassignedLead: jest.fn(),
  emitActivityLog: jest.fn(),
  emitStatusChange: jest.fn(),
  emitPriorityChange: jest.fn(),
  emitNewAssignment: jest.fn(),
  emitLeadAssigned: jest.fn(),
  emitNotification: jest.fn(),
  emitToSuperadmins: jest.fn(),
  broadcastToRoom: jest.fn(),
  getIO: jest.fn().mockReturnValue({ to: jest.fn().mockReturnThis(), emit: jest.fn() })
}));

jest.mock('../../services/emailServiceNodeMailer', () => ({
  sendLeadNotification: jest.fn().mockResolvedValue(true),
  sendManualLeadNotification: jest.fn().mockResolvedValue(true),
  sendLeadAssignedNotification: jest.fn().mockResolvedValue(true),
  sendBulkLeadAssignedNotification: jest.fn().mockResolvedValue(true)
}));

describe('Notification Persistence Integration Tests', () => {
  let superWorker, superAdminUser;
  let workerA, adminUserA;
  let workerB, adminUserB;
  let testRunId;

  beforeEach(async () => {
    testRunId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await Notification.deleteMany({});
    await Lead.deleteMany({});
    await TeamMember.deleteMany({});
    await Admin.deleteMany({});

    jest.clearAllMocks();

    const getTranslations = (name) => ({
      en: { name, title: 'Agent', bio: 'Bio' },
      he: { name, title: 'Agent', bio: 'Bio' },
      ar: { name, title: 'Agent', bio: 'Bio' }
    });

    // 1. Create Super Admin (Worker + User)
    superWorker = await TeamMember.create({
      email: `super_${testRunId}@test.com`,
      translations: getTranslations('Super Admin'),
      role: 'Agent',
      licenseNumber: `SA-${testRunId}`,
      active: true
    });
    superAdminUser = await Admin.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: `super_login_${testRunId}@test.com`,
      password: 'password123', // ✅ FIXED: > 6 chars
      role: 'superadmin',
      workerProfile: superWorker._id
    });

    // 2. Create Agent A (Worker + User)
    workerA = await TeamMember.create({
      email: `agentA_${testRunId}@test.com`,
      translations: getTranslations('Agent A'),
      role: 'Agent',
      licenseNumber: `A-${testRunId}`,
      active: true
    });
    adminUserA = await Admin.create({
      firstName: 'Agent',
      lastName: 'A',
      email: `agentA_login_${testRunId}@test.com`,
      password: 'password123', // ✅ FIXED
      role: 'admin',
      workerProfile: workerA._id
    });

    // 3. Create Agent B (Worker + User)
    workerB = await TeamMember.create({
      email: `agentB_${testRunId}@test.com`,
      translations: getTranslations('Agent B'),
      role: 'Agent',
      licenseNumber: `B-${testRunId}`,
      active: true
    });
    adminUserB = await Admin.create({
      firstName: 'Agent',
      lastName: 'B',
      email: `agentB_login_${testRunId}@test.com`,
      password: 'password123', // ✅ FIXED
      role: 'admin',
      workerProfile: workerB._id
    });
  });

  test('Persistence: Website Lead saves alert for Super Admins', async () => {
    const leadData = {
      fullName: 'Web Lead',
      email: `web_${testRunId}@t.com`,
      phoneNumber: '123',
      inquiryType: 'buying',
      source: 'Website Contact Form'
    };

    await leadService.createLead(leadData);

    // Check notification for Super Admin User
    const superNotif = await Notification.findOne({ recipient: superAdminUser._id });
    expect(superNotif).not.toBeNull();
    expect(superNotif.type).toBe('LEAD_CREATED');
  });

  test('Persistence: Assigned Lead saves alert for Target Agent', async () => {
    const input = {
      fullName: 'Assigned Lead',
      email: `assign_${testRunId}@t.com`,
      phoneNumber: '123',
      inquiryType: 'buying',
      assignedTo: workerA._id // Assign to Worker
    };

    const adminInfo = { name: 'Super Admin', id: superAdminUser._id.toString() };

    await leadService.createLeadManually(input, adminInfo);

    // Check notification for Agent A's ADMIN account
    const agentNotif = await Notification.findOne({ recipient: adminUserA._id });
    
    expect(agentNotif).not.toBeNull();
    expect(agentNotif.type).toBe('LEAD_ASSIGNED');
    expect(agentNotif.message).toContain('assigned');
  });

  test('Persistence: Reassignment saves alert for New Agent', async () => {
    const lead = await Lead.create({
      fullName: 'Transfer Lead',
      email: `transfer_${testRunId}@t.com`,
      phoneNumber: '123',
      inquiryType: 'buying',
      source: 'Manual Entry',
      assignedTo: workerA._id // Start with A
    });

    const adminInfo = { name: 'Super Admin', id: superAdminUser._id.toString() };

    // Move to Agent B
    await leadService.assignLead(lead._id, workerB._id, adminInfo);

    // Agent B should get an alert
    const notifB = await Notification.findOne({ 
      recipient: adminUserB._id,
      type: 'LEAD_ASSIGNED'
    });
    expect(notifB).not.toBeNull();
    expect(notifB.message).toContain('assigned');
  });

  test('Persistence: Manager changing status saves alert for Owner', async () => {
    const lead = await Lead.create({
      fullName: 'Status Lead',
      email: `status_${testRunId}@t.com`,
      phoneNumber: '123',
      inquiryType: 'buying',
      source: 'Manual Entry',
      status: 'New',
      assignedTo: workerA._id
    });

    // Super Admin changes status
    const adminInfo = { name: 'Super Admin', id: superAdminUser._id.toString() };
    
    await leadService.updateLeadStatus(lead._id, 'Contacted', adminInfo);

    // Agent A should be notified
    const notif = await Notification.findOne({ 
      recipient: adminUserA._id,
      type: 'STATUS_CHANGE' 
    });

    expect(notif).not.toBeNull();
    expect(notif.message).toContain('Super Admin changed status');
  });

  test('Persistence: Bulk Assignment saves ONE summary alert', async () => {
    const l1 = await Lead.create({ 
      fullName: 'L1', 
      email: `1_${testRunId}@t.com`, 
      phoneNumber: '1', 
      inquiryType: 'buying', 
      source: 'Manual Entry' 
    });
    
    const l2 = await Lead.create({ 
      fullName: 'L2', 
      email: `2_${testRunId}@t.com`, 
      phoneNumber: '2', 
      inquiryType: 'buying', 
      source: 'Manual Entry' 
    });

    // Bulk assign to Agent A
    const adminInfo = { 
      name: 'Super Admin', 
      id: superAdminUser._id.toString(),
      _id: superAdminUser._id 
    };

    await leadService.bulkAssignLeads({
      leadIds: [l1._id, l2._id],
      selectAll: false,
      assignedTo: workerA._id,
      adminInfo
    });

    // Agent A should get ONE summary notification
    const notif = await Notification.findOne({ 
      recipient: adminUserA._id,
      type: 'BULK_ASSIGNMENT' 
    });

    expect(notif).not.toBeNull();
    expect(notif.message).toContain('2 new leads');
  });
});