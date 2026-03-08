/**
 * tests/integration/leadService.test.js
 * ✅ FIXED: Added .id property to test actors (POJOs missing Mongoose virtuals)
 */

const mongoose = require('mongoose');
const Lead = require('../../models/Lead');
const LeadActivity = require('../../models/LeadActivity');
const TeamMember = require('../../models/TeamMember');
const Admin = require('../../models/Admin');
const leadService = require('../../services/leadService');
const notificationService = require('../../services/notificationService');
const socketService = require('../../services/socket/socketService');
const emailService = require('../../services/emailServiceNodeMailer');

// 1. ROBUST MOCKS
jest.mock('../../services/notificationService', () => ({
  notifySuperAdmins: jest.fn(),
  createNotification: jest.fn()
}));

jest.mock('../../services/socket/socketService', () => {
  const mockEmit = jest.fn();
  const mockTo = jest.fn(() => ({ emit: mockEmit }));
  return {
    emitNewUnassignedLead: jest.fn(),
    emitActivityLog: jest.fn(),
    emitStatusChange: jest.fn(),
    emitNewAssignment: jest.fn(),
    emitLeadAssigned: jest.fn(),
    broadcastToRoom: jest.fn(),
    getIO: jest.fn(() => ({ to: mockTo }))
  };
});

//  Complete Mock for New Email Engine
jest.mock('../../services/emailServiceNodeMailer', () => ({
  sendLeadNotification: jest.fn().mockResolvedValue(true),
  sendManualLeadNotification: jest.fn().mockResolvedValue(true),
  sendLeadAssignedNotification: jest.fn().mockResolvedValue(true),
  sendBulkLeadAssignedNotification: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../services/activityService', () => ({
  logSystemActivity: jest.fn().mockResolvedValue(true)
}));

describe('LeadService Integration Tests (QA Workflows)', () => {
  let superAdmin;
  let workerY, adminY;
  let workerZ, adminZ; 
  let testRunId;

  beforeEach(async () => {
    testRunId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await LeadActivity.deleteMany({});
    await Lead.deleteMany({});
    await TeamMember.deleteMany({});
    await Admin.deleteMany({});
    
    jest.clearAllMocks();

    // 2. Create Super Admin
    const saDoc = await Admin.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: `super_${testRunId}@test.com`,
      password: 'password123',
      role: 'superadmin'
    });
    
    // ✅ FIX: Attach 'name' AND 'id' property manually
    superAdmin = saDoc.toObject();
    superAdmin.name = 'Super Admin'; 
    superAdmin.id = saDoc._id.toString(); // <--- CRITICAL FIX

    // 3. Helper to create Linked Account (Worker + Admin)
    const createAgent = async (letter) => {
      const worker = await TeamMember.create({
        translations: {
          en: { name: `Agent ${letter}`, title: 'Agent', bio: 'Bio' },
          he: { name: `Agent ${letter}`, title: 'Agent', bio: 'Bio' },
          ar: { name: `Agent ${letter}`, title: 'Agent', bio: 'Bio' }
        },
        email: `${letter.toLowerCase()}_${testRunId}@test.com`,
        phone: '123',
        licenseNumber: `${letter}-${testRunId}`,
        active: true
      });

      const adminDoc = await Admin.create({
        firstName: 'Agent',
        lastName: letter,
        email: `${letter.toLowerCase()}_admin_${testRunId}@test.com`,
        password: 'password123',
        role: 'admin',
        workerProfile: worker._id
      });
      
      const admin = adminDoc.toObject();
      // ✅ FIX: Attach 'name' AND 'id' property
      admin.name = `Agent ${letter}`; 
      admin.id = adminDoc._id.toString(); // <--- CRITICAL FIX
      
      return { worker, admin, adminDoc }; 
    };

    const yPair = await createAgent('Y');
    workerY = yPair.worker;
    adminY = yPair.admin;

    const zPair = await createAgent('Z');
    workerZ = zPair.worker;
    adminZ = zPair.admin;
  });

  // =================================================================
  // SCENARIO A
  // =================================================================
  test('Scenario A: New Lead from External Source (Website)', async () => {
    const input = {
      fullName: 'Public User',
      email: `public_${testRunId}@test.com`,
      phoneNumber: '0500000000',
      inquiryType: 'buying',
      source: 'Website Contact Form'
    };

    const lead = await leadService.createLead(input);

    const dbLead = await Lead.findById(lead._id).lean();
    expect(dbLead.assignedTo).toBeNull();

    expect(notificationService.notifySuperAdmins).toHaveBeenCalledWith(
      'LEAD_CREATED',
      'New Lead Created',
      expect.stringContaining('New lead received'),
      expect.any(Object)
    );
  });

  // =================================================================
  // SCENARIO B
  // =================================================================
  test('Scenario B: New Lead Manually Created (Unassigned)', async () => {
    const input = {
      fullName: 'Generic Lead',
      email: `generic_${testRunId}@test.com`,
      phoneNumber: '0500000001',
      inquiryType: 'renting',
      assignedTo: null
    };

    await leadService.createLeadManually(input, superAdmin);

    const dbLead = await Lead.findOne({ email: input.email }).lean();
    expect(dbLead.assignedTo).toBeNull();

    // Now expectation matches: 5th argument is the ID string (not undefined)
    expect(notificationService.notifySuperAdmins).toHaveBeenCalledWith(
      'LEAD_CREATED',
      'New Lead Created',
      expect.stringContaining('created a new unassigned lead'),
      expect.any(Object),
      superAdmin.id // Expect the ID we just added
    );
  });

  // =================================================================
  // SCENARIO C
  // =================================================================
  test('Scenario C: New Lead Manually Created (Assigned)', async () => {
    const input = {
      fullName: 'Assigned Lead',
      email: `assigned_${testRunId}@test.com`,
      phoneNumber: '0500000002',
      inquiryType: 'buying',
      assignedTo: workerY._id
    };

    await leadService.createLeadManually(input, superAdmin);

    const dbLead = await Lead.findOne({ email: input.email }).lean();
    expect(dbLead.assignedTo.toString()).toBe(workerY._id.toString());

    // 1. Check Agent Notification
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      adminY._id,
      'LEAD_ASSIGNED',
      'New Lead Assigned',
      expect.stringContaining('assigned lead Assigned Lead to you'),
      expect.any(Object),
      superAdmin.id // Expect actorId
    );

    // 2. Check Super Admin Notification
    expect(notificationService.notifySuperAdmins).toHaveBeenCalledWith(
      'LEAD_CREATED',
      'New Lead Created',
      expect.stringContaining('created lead Assigned Lead and assigned it'),
      expect.any(Object),
      superAdmin.id // Expect actorId
    );
  });

  // =================================================================
  // SCENARIO D
  // =================================================================
  test('Scenario D: Lead Reassignment (Y -> Z)', async () => {
    const lead = await Lead.create({
      fullName: 'Handover Lead',
      email: `handover_${testRunId}@test.com`,
      phoneNumber: '999',
      inquiryType: 'buying',
      source: 'Manual Entry',
      assignedTo: workerY._id
    });

    const adminInfo = { id: superAdmin._id, name: 'Superadmin' };

    await leadService.assignLead(lead._id, workerZ._id, adminInfo);

    await new Promise(resolve => setTimeout(resolve, 100));

    const updatedLeadRaw = await Lead.findById(lead._id);
    expect(updatedLeadRaw.assignedTo.toString()).toBe(workerZ._id.toString());

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      adminZ._id,
      'LEAD_ASSIGNED',
      expect.any(String),
      expect.stringContaining('assigned lead Handover Lead to you'),
      expect.any(Object)
    );

    expect(socketService.broadcastToRoom).toHaveBeenCalledWith(
      `lead_${lead._id}`,
      'lead_access_revoked',
      expect.objectContaining({ reason: 'reassigned' })
    );
  });

  // =================================================================
  // SCENARIO E
  // =================================================================
  test('Scenario E (Case 1): Self-Change (Agent Y updates own lead)', async () => {
    const lead = await Lead.create({
      fullName: 'Self Lead',
      email: `self_${testRunId}@test.com`,
      phoneNumber: '111',
      inquiryType: 'buying',
      status: 'New',
      source: 'Manual Entry',
      assignedTo: workerY._id
    });

    // Use WORKER ID for the Actor ID to match controller logic
    const agentYInfo = { 
      name: 'Agent Y', 
      id: workerY._id.toString() 
    };

    await leadService.updateLeadStatus(lead._id, 'Contacted', agentYInfo);

    expect(notificationService.notifySuperAdmins).toHaveBeenCalled();
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  test('Scenario E (Case 2): Manager Change (Superadmin updates Agent Y lead)', async () => {
    const lead = await Lead.create({
      fullName: 'Manager Lead',
      email: `manager_${testRunId}@test.com`,
      phoneNumber: '222',
      inquiryType: 'buying',
      status: 'New',
      source: 'Manual Entry',
      assignedTo: workerY._id
    });

    const superAdminInfo = { name: 'Super', id: superAdmin._id.toString() };

    await leadService.updateLeadStatus(lead._id, 'Contacted', superAdminInfo);

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      adminY._id,
      'STATUS_CHANGE',
      expect.any(String),
      expect.stringContaining('changed status'),
      expect.any(Object)
    );
  });
});