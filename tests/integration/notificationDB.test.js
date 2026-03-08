/**
 * tests/integration/notificationDB.test.js
 * ✅ FIXED: Correct Actor IDs for Self-Check & Manual Assignment
 */

const mongoose = require('mongoose');
const leadService = require('../../services/leadService');
const Lead = require('../../models/Lead');
const LeadActivity = require('../../models/LeadActivity');
const TeamMember = require('../../models/TeamMember');
const Admin = require('../../models/Admin');
const notificationService = require('../../services/notificationService');
const emailService = require('../../services/emailServiceNodeMailer');

// Import actual constants to satisfy Enum validation
const { LEAD_STATUS, INQUIRY_TYPES, LEAD_SOURCES } = require('../../constants/constants');

jest.mock('../../services/notificationService');

jest.mock('../../services/emailServiceNodeMailer', () => ({
  sendLeadNotification: jest.fn().mockResolvedValue(true),
  sendManualLeadNotification: jest.fn().mockResolvedValue(true),
  sendLeadAssignedNotification: jest.fn().mockResolvedValue(true),
  sendBulkLeadAssignedNotification: jest.fn().mockResolvedValue(true)
}));

// Robust Socket Mock
jest.mock('../../services/socket/socketService', () => {
  const mockEmit = jest.fn();
  const mockTo = jest.fn(() => ({ emit: mockEmit }));
  return {
    emitActivityLog: jest.fn(),
    emitNewLead: jest.fn(),
    emitNewAssignment: jest.fn(),
    broadcastToRoom: jest.fn(),
    getIO: jest.fn(() => ({ to: mockTo }))
  };
});

describe('Lead Management & Notification Integration', () => {
  let mockSuperAdminId;
  let mockAgent;
  let mockAgentAdmin;

  const validInquiry = Object.values(INQUIRY_TYPES)[0];
  const validSource = LEAD_SOURCES[0] || 'Manual Entry';

  beforeEach(async () => {
    await Lead.deleteMany({});
    await LeadActivity.deleteMany({});
    await TeamMember.deleteMany({});
    await Admin.deleteMany({});

    jest.clearAllMocks();

    mockSuperAdminId = new mongoose.Types.ObjectId();
    const unique = Date.now();

    // 1. Create TeamMember (Worker Profile)
    mockAgent = await TeamMember.create({
      _id: new mongoose.Types.ObjectId(),
      email: `agent_${unique}@allin.com`,
      licenseNumber: `RE-TEST-VALID-${unique}`,
      active: true,
      translations: {
        en: { name: 'Agent Smith', title: 'Agent', bio: 'Bio en' },
        he: { name: 'סוכן סמית', title: 'סוכן', bio: 'Bio he' },
        ar: { name: 'عميل', title: 'وكيل', bio: 'Bio ar' }
      }
    });

    // 2. Create Linked Admin (User Account)
    mockAgentAdmin = await Admin.create({
      firstName: 'Agent',
      lastName: 'Smith',
      email: `admin_${unique}@allin.com`,
      password: 'password123',
      role: 'admin',
      workerProfile: mockAgent._id
    });
  });

  test('Public Lead Submission: Save, Notify, and Email', async () => {
    const leadData = {
      fullName: 'John Public',
      email: `john_${Date.now()}@example.com`,
      phoneNumber: '123456789',
      inquiryType: validInquiry,
      source: validSource
    };

    const lead = await leadService.createLead(leadData, '192.168.1.1');

    const dbLead = await Lead.findById(lead._id);
    expect(dbLead).not.toBeNull();
    expect(dbLead.fullName).toBe('John Public');

    expect(notificationService.notifySuperAdmins).toHaveBeenCalled();
    expect(emailService.sendLeadNotification).toHaveBeenCalled();
  });

  test('Manual Lead Assignment: Dual Notification Logic', async () => {
    // ✅ FIX 1: Add .id property. The service uses adminUser.id for the actorId.
    const adminUser = { 
      _id: mockSuperAdminId, 
      id: mockSuperAdminId.toString(), // <--- ADDED
      name: 'Lead Architect' 
    };

    const leadData = {
      fullName: 'Manual Lead',
      email: `manual_${Date.now()}@test.com`,
      phoneNumber: '555-555',
      inquiryType: validInquiry,
      source: 'Manual Entry',
      assignedTo: mockAgent._id
    };

    await leadService.createLeadManually(leadData, adminUser);

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      mockAgentAdmin._id, 
      'LEAD_ASSIGNED',
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      expect.any(String) // Now expects the string ID, not undefined
    );
  });

  test('Self-Update Filter: No notification to actor', async () => {
    const lead = await Lead.create({
      fullName: 'Private Lead',
      email: `p_${Date.now()}@test.com`,
      phoneNumber: '0',
      inquiryType: validInquiry,
      source: validSource,
      assignedTo: mockAgent._id
    });

    // ✅ FIX 2: Use WORKER ID (mockAgent._id), not Admin ID.
    // The controller logic (getAdminLogInfo) uses the workerProfile ID if it exists.
    // Since this lead is assigned to mockAgent._id, we must pass that ID 
    // to trigger the "Lead.assignedTo === ActorID" check.
    const adminInfo = { 
      id: mockAgent._id.toString(), // <--- CHANGED from mockAgentAdmin._id
      name: 'Agent Smith' 
    };
    
    await leadService.updateLeadStatus(lead._id, LEAD_STATUS.CONTACTED, adminInfo);

    // Should NOT notify themselves
    expect(notificationService.createNotification).not.toHaveBeenCalledWith(
      mockAgentAdmin._id,
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(Object)
    );
  });

  test('Single Reassignment: Activity Log and Timestamp', async () => {
    const lead = await Lead.create({
      fullName: 'To Be Reassigned',
      email: `r_${Date.now()}@test.com`,
      phoneNumber: '0',
      inquiryType: validInquiry,
      source: validSource
    });

    const adminInfo = { id: mockSuperAdminId.toString(), name: 'Super Admin' };
    await leadService.assignLead(lead._id, mockAgent._id, adminInfo);

    const activity = await LeadActivity.findOne({ lead: lead._id, type: 'assignment' });
    expect(activity).not.toBeNull();
    expect(notificationService.createNotification).toHaveBeenCalled();
  });

  test('Bulk Lead Assignment: Multiple logs, single notification', async () => {
    const unique = Date.now();

    const leads = await Lead.create([
      { fullName: 'L1', email: `1_${unique}@t.com`, phoneNumber: '1', inquiryType: validInquiry, source: validSource },
      { fullName: 'L2', email: `2_${unique}@t.com`, phoneNumber: '2', inquiryType: validInquiry, source: validSource }
    ]);

    const adminInfo = { id: mockSuperAdminId.toString(), name: 'Super Admin' };
    await leadService.bulkAssignLeads({
      leadIds: leads.map(l => l._id),
      assignedTo: mockAgent._id,
      adminInfo
    });

    const logs = await LeadActivity.find({ type: 'assignment' });
    expect(logs).toHaveLength(2);
    expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
  });

  test('Unassigned Lead Filter: Helper correctly targets null', async () => {
    const unique = Date.now();

    await Lead.create([
      { fullName: 'A', email: `a_${unique}@t.com`, phoneNumber: '1', inquiryType: validInquiry, source: validSource, assignedTo: mockAgent._id },
      { fullName: 'U', email: `u_${unique}@t.com`, phoneNumber: '2', inquiryType: validInquiry, source: validSource, assignedTo: null }
    ]);

    const result = await leadService.getFilteredLeads({ assignedTo: 'unassigned' });

    expect(result.total).toBe(1);
    expect(result.leads[0].fullName).toBe('U');
  });

  test('Bulk Deletion Cleanup: Cascade delete LeadActivities', async () => {
    const lead = await Lead.create({
      fullName: 'Ghost',
      email: `g_${Date.now()}@t.com`,
      phoneNumber: '0',
      inquiryType: validInquiry,
      source: validSource
    });

    await LeadActivity.create({
      lead: lead._id,
      type: 'comment',
      content: 'X',
      authorName: 'S',
      authorId: '1'
    });
    
    // Pass adminInfo to prevent crash
    const adminInfo = { id: mockSuperAdminId.toString(), name: 'Super Admin' };
    
    await leadService.bulkDeleteLeads({ 
      leadIds: [lead._id], 
      selectAll: false, 
      adminInfo 
    });

    const leadCheck = await Lead.findById(lead._id);
    const activityCheck = await LeadActivity.find({ lead: lead._id });

    expect(leadCheck).toBeNull();
    expect(activityCheck).toHaveLength(0);
  });
});