/**
 * tests/integration/leadSystem.test.js
 * * COMPREHENSIVE LEAD FLOW TEST
 * Covers: Create -> Assign -> Notify -> Reassign -> Bulk Delete
 */

const mongoose = require('mongoose');
const leadService = require('../../services/leadService');
const notificationService = require('../../services/notificationService');
const Lead = require('../../models/Lead');
const Admin = require('../../models/Admin');
const TeamMember = require('../../models/TeamMember');
const Notification = require('../../models/Notification');
// Import real constants to ensure test data is valid
const { LEAD_STATUS, INQUIRY_TYPES, LEAD_SOURCES } = require('../../constants/constants');

// =================================================================
// 1. MOCKS
// =================================================================

// A. Mock Socket Service
const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
jest.mock('../../services/socket/socketService', () => ({
  initialize: jest.fn(),
  getIO: jest.fn(() => ({ to: mockTo })), 
  broadcastToRoom: jest.fn(),
  emitNewAssignment: jest.fn(),
  emitNotification: jest.fn(),
  emitNewLead: jest.fn()
}));
const socketService = require('../../services/socket/socketService');

// B. Mock Email Service
jest.mock('../../services/emailServiceNodeMailer', () => ({
  sendLeadNotification: jest.fn().mockResolvedValue(true),
  sendManualLeadNotification: jest.fn().mockResolvedValue(true),
  sendLeadAssignedNotification: jest.fn().mockResolvedValue(true),
  sendBulkLeadAssignedNotification: jest.fn().mockResolvedValue(true)
}));

// C. Mock Activity Service
jest.mock('../../services/activityService', () => ({
  logSystemActivity: jest.fn().mockResolvedValue(true)
}));
const activityService = require('../../services/activityService');

// =================================================================
// 2. TEST SUITE
// =================================================================

describe('Lead System Integration', () => {
  let superAdmin, agentA, agentB;
  let runId;

  // SETUP: Create fresh actors before each test
  beforeEach(async () => {
    runId = Date.now(); 

    // 1. Clear DB
    await Lead.deleteMany({});
    await Notification.deleteMany({});
    await Admin.deleteMany({});
    await TeamMember.deleteMany({});
    
    // 2. Clear Mocks
    jest.clearAllMocks();

    // 3. Create Super Admin
    superAdmin = await Admin.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: `super${runId}@test.com`,
      password: 'password123', 
      role: 'superadmin'
    });

    // 4. Create Agent A
    const workerA = await TeamMember.create({
      licenseNumber: `L-A-${runId}`,
      active: true,
      translations: { 
        en: { name: 'Agent A', title: 'Agent', bio: 'Bio EN' },
        he: { name: 'סוכן א', title: 'סוכן', bio: 'Bio HE' },
        ar: { name: 'وكيل أ', title: 'وكيل', bio: 'Bio AR' }
      },
      email: `agenta${runId}@test.com`
    });
    
    agentA = await Admin.create({
      firstName: 'Agent',
      lastName: 'A',
      email: `adminA${runId}@test.com`,
      password: 'password123',
      role: 'admin',
      workerProfile: workerA._id
    });

    // 5. Create Agent B
    const workerB = await TeamMember.create({
      licenseNumber: `L-B-${runId}`,
      active: true,
      translations: { 
        en: { name: 'Agent B', title: 'Agent', bio: 'Bio EN' },
        he: { name: 'סוכן ב', title: 'סוכן', bio: 'Bio HE' },
        ar: { name: 'وكيل ب', title: 'وكيل', bio: 'Bio AR' }
      },
      email: `agentb${runId}@test.com`
    });

    agentB = await Admin.create({
      firstName: 'Agent',
      lastName: 'B',
      email: `adminB${runId}@test.com`,
      password: 'password123',
      role: 'admin',
      workerProfile: workerB._id
    });
  });

  // =================================================================
  // SCENARIO 1: Manual Lead Creation (Assigned)
  // =================================================================
  test('Scenario 1: Manual Creation -> Assigns & Notifies', async () => {
    const leadData = {
      fullName: 'Manual Lead',
      email: `lead${runId}@test.com`,
      phoneNumber: '123',
      inquiryType: 'consulting', // ✅ FIXED: Valid Enum
      source: 'Manual Entry',    // ✅ FIXED: Valid Enum
      assignedTo: agentA.workerProfile._id
    };

    // ACT
    const lead = await leadService.createLeadManually(leadData, superAdmin);

    // ASSERT 1: Lead Saved
    expect(lead).toBeDefined();
    expect(lead.assignedTo.toString()).toBe(agentA.workerProfile._id.toString());

    // ASSERT 2: Notification Created
    const agentNotif = await Notification.findOne({ recipient: agentA._id });
    expect(agentNotif).not.toBeNull();
    expect(agentNotif.type).toBe('LEAD_ASSIGNED');
    expect(agentNotif.title).toContain('Lead Assigned');

    // ASSERT 3: Socket Event
    expect(socketService.emitNewAssignment).toHaveBeenCalledWith(
      agentA._id.toString(), 
      expect.anything()
    );
  });

  // =================================================================
  // SCENARIO 2: Reassignment (The "Kick-Out" Logic)
  // =================================================================
  test('Scenario 2: Reassignment triggers Kick-Out & Alerts', async () => {
    // SETUP: Lead belongs to Agent A
    const lead = await Lead.create({
      fullName: 'Moving Lead',
      email: 'move@test.com',
      phoneNumber: '111',
      inquiryType: 'consulting', // ✅ FIXED
      source: 'Manual Entry',    // ✅ FIXED
      assignedTo: agentA.workerProfile._id
    });

    const adminInfo = { id: superAdmin._id, name: 'SuperAdmin' };

    // ACT: Reassign to Agent B
    await leadService.assignLead(lead._id, agentB.workerProfile._id, adminInfo);

    // ASSERT 1: Database Updated
    const updatedLead = await Lead.findById(lead._id);
    expect(updatedLead.assignedTo.toString()).toBe(agentB.workerProfile._id.toString());

    // ASSERT 2: Activity Logged
    expect(activityService.logSystemActivity).toHaveBeenCalledWith(expect.objectContaining({
      type: 'assignment',
      leadId: lead._id
    }));

    // ASSERT 3: "Kick-Out" Socket Event
    expect(socketService.broadcastToRoom).toHaveBeenCalledWith(
      `lead_${lead._id}`,
      'lead_access_revoked',
      expect.objectContaining({ reason: 'reassigned' })
    );

    // ASSERT 4: Notification for New Owner
    const notifB = await Notification.findOne({ recipient: agentB._id });
    expect(notifB).toBeDefined();
    expect(notifB.type).toBe('LEAD_ASSIGNED');

    // ASSERT 5: Notification for Old Owner
    const notifA = await Notification.findOne({ recipient: agentA._id });
    expect(notifA).toBeDefined();
    expect(notifA.type).toBe('LEAD_REASSIGNED');
  });

  // =================================================================
  // SCENARIO 3: Bulk Delete (Integrity Check)
  // =================================================================
  test('Scenario 3: Bulk Delete cleans up and notifies', async () => {
    // SETUP: 2 Leads for Agent A
    const l1 = await Lead.create({ 
      fullName: 'D1', 
      email: 'd1@t.com', 
      phoneNumber: '1', 
      inquiryType: 'consulting', // ✅ FIXED
      source: 'Manual Entry',    // ✅ FIXED
      assignedTo: agentA.workerProfile._id 
    });
    
    const l2 = await Lead.create({ 
      fullName: 'D2', 
      email: 'd2@t.com', 
      phoneNumber: '2', 
      inquiryType: 'consulting', // ✅ FIXED
      source: 'Manual Entry',    // ✅ FIXED
      assignedTo: agentA.workerProfile._id 
    });

    const adminInfo = { id: superAdmin._id, name: 'SuperAdmin' };

    // ACT
    const result = await leadService.bulkDeleteLeads({
      leadIds: [l1._id, l2._id],
      selectAll: false,
      adminInfo: adminInfo
    });

    // ASSERT 1: Leads Gone
    expect(result.deletedLeads).toBe(2);
    const checkL1 = await Lead.findById(l1._id);
    expect(checkL1).toBeNull();

    // ASSERT 2: Notification sent to Agent A
    const notif = await Notification.findOne({ recipient: agentA._id });
    expect(notif).not.toBeNull();
    expect(JSON.stringify(notif)).toEqual(expect.stringMatching(/leads were deleted/));

    // ASSERT 3: Kick-out signal
    expect(mockTo).toHaveBeenCalledWith(`lead_${l1._id}`);
    expect(mockEmit).toHaveBeenCalledWith('lead_access_revoked', expect.anything());
  });

});