// backend/tests/services/leadService.test.js

// 1. MOCK DEPENDENCIES BEFORE IMPORTING SERVICE
const mockLead = {
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
  deleteMany: jest.fn(),
  updateMany: jest.fn(),
  aggregate: jest.fn(),
  insertMany: jest.fn(),
};

const mockAdmin = {
  find: jest.fn(),
};

const mockLeadActivity = {
  create: jest.fn(),
  deleteMany: jest.fn(),
  insertMany: jest.fn(),
  find: jest.fn(),
};

const mockTeamMember = {
  findById: jest.fn(),
};

// Mock External Services
const mockSocketService = {
  emitNewLead: jest.fn(),
  emitNewAssignment: jest.fn(),
  emitActivityLog: jest.fn(),
  emitLeadDeleted: jest.fn(),
  broadcastToRoom: jest.fn(),
  getIO: jest.fn(() => ({
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  })),
};

const mockNotificationService = {
  notifySuperAdmins: jest.fn(),
  createNotification: jest.fn(),
};

const mockActivityService = {
  logSystemActivity: jest.fn(),
};

const mockEmailService = {
  sendLeadNotification: jest.fn(),
};

// Mock Utilities
const mockGenericQueryHelper = {
  paginate: jest.fn((page, limit) => ({ page: page || 1, limit: limit || 10, skip: 0 })),
};

// 2. APPLY MOCKS
jest.mock('../../models/Lead', () => mockLead);
jest.mock('../../models/Admin', () => mockAdmin);
jest.mock('../../models/LeadActivity', () => mockLeadActivity);
jest.mock('../../models/TeamMember', () => mockTeamMember);
jest.mock('../../services/socket/socketService', () => mockSocketService);
jest.mock('../../services/notificationService', () => mockNotificationService);
jest.mock('../../services/activityService', () => mockActivityService);
jest.mock('../../services/emailServiceNodeMailer', () => mockEmailService);
jest.mock('../../utils/genericQueryHelper', () => mockGenericQueryHelper);

// Import the Service under test
const leadService = require('../../services/leadService');
const AppError = require('../../utils/AppError');
const { LEAD_STATUS } = require('../../constants/constants');

// 3. HELPER FOR MONGOOSE CHAINING
// This allows us to handle Lead.find().populate().sort().skip()...
// AND Admin.find().select() which is awaited directly
const mockMongooseChain = (returnData) => {
  return {
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(returnData),
    // Make the object "thenable" so await works directly on the chain
    // (needed for: await Admin.find().select())
    then: function(resolve) {
      resolve(returnData);
    }
  };
};

describe('LeadService', () => {
  
  // Clear all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =================================================================
  // TEST: getFilteredLeads
  // =================================================================
  describe('getFilteredLeads', () => {
    it('should return paginated leads with personalized unread counts', async () => {
      const mockLeads = [
        { _id: 'lead1', fullName: 'John Doe', unreadBy: { 'admin123': 5 } },
        { _id: 'lead2', fullName: 'Jane Doe', unreadBy: { 'admin123': 0 } }
      ];

      // Setup the chain
      mockLead.find.mockReturnValue(mockMongooseChain(mockLeads));
      mockLead.countDocuments.mockResolvedValue(2);

      const filters = { page: 1, limit: 10, status: 'New' };
      const adminId = 'admin123';

      const result = await leadService.getFilteredLeads(filters, null, adminId);

      // Assertions
      expect(mockLead.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'New' }));
      expect(result.leads[0].unreadCount).toBe(5); // Check personalization logic
      expect(result.leads[1].unreadCount).toBe(0);
      expect(result.total).toBe(2);
    });

    it('should filter by assignedTo = "unassigned"', async () => {
        mockLead.find.mockReturnValue(mockMongooseChain([]));
        mockLead.countDocuments.mockResolvedValue(0);
  
        await leadService.getFilteredLeads({ assignedTo: 'unassigned' });
  
        // Should query assignedTo: null
        expect(mockLead.find).toHaveBeenCalledWith(expect.objectContaining({ assignedTo: null }));
    });
  });

  // =================================================================
  // TEST: getLeadById
  // =================================================================
  describe('getLeadById', () => {
    it('should return lead and reset unread count for viewer', async () => {
      const mockLeadData = { _id: 'lead1', fullName: 'Test' };
      const viewerId = 'admin123';

      // Mock findByIdAndUpdate chain
      mockLead.findByIdAndUpdate.mockReturnValue(mockMongooseChain(mockLeadData));

      const result = await leadService.getLeadById('lead1', viewerId);

      expect(mockLead.findByIdAndUpdate).toHaveBeenCalledWith(
        'lead1',
        { $set: { 'unreadBy.admin123': 0 } }, // Critical check
        { new: true }
      );
      expect(mockSocketService.broadcastToRoom).toHaveBeenCalledWith(
        'admin_admin123',
        'lead_unread_update',
        expect.any(Object)
      );
      expect(result).toEqual(mockLeadData);
    });

    it('should throw 404 if lead not found', async () => {
      mockLead.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });

      await expect(leadService.getLeadById('invalid_id', 'admin1'))
        .rejects.toThrow(AppError);
    });
  });

  // =================================================================
  // TEST: createLead
  // =================================================================
  describe('createLead', () => {
    it('should create a lead, notify superadmins, and send email', async () => {
      const leadData = { fullName: 'New Guy', email: 'test@test.com' };
      const createdLead = { _id: 'lead1', ...leadData };

      mockLead.create.mockResolvedValue(createdLead);

      const result = await leadService.createLead(leadData);

      expect(mockLead.create).toHaveBeenCalled();
      expect(mockNotificationService.notifySuperAdmins).toHaveBeenCalledWith(
        'LEAD_CREATED',
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
      expect(mockEmailService.sendLeadNotification).toHaveBeenCalledWith(createdLead);
      expect(result).toEqual(createdLead);
    });
  });

  // =================================================================
  // TEST: assignLead
  // =================================================================
  describe('assignLead', () => {
    const adminInfo = { id: 'admin1', name: 'Super Admin' };
    const leadId = 'lead1';
    const newAssigneeId = 'worker2';
    
    it('should assign lead and notify the new agent', async () => {
      // 1. Mock Old Lead
      mockLead.findById.mockResolvedValue({ _id: leadId, assignedTo: null });
      
      // 2. Mock Update Result
      const updatedLead = { 
        _id: leadId, 
        assignedTo: { _id: newAssigneeId, translations: { en: { name: 'Worker 2' } } },
        fullName: 'Client Name'
      };
      
      mockLead.findByIdAndUpdate.mockReturnValue(mockMongooseChain(updatedLead));
      
      // 3. Mock helper finding admin IDs for worker profile
      // FIX: Use mockReturnValue(mockMongooseChain) because code uses .select()
      mockAdmin.find.mockReturnValue(mockMongooseChain([{ _id: 'admin_user_2' }])); 

      await leadService.assignLead(leadId, newAssigneeId, adminInfo);

      // Checks
      expect(mockActivityService.logSystemActivity).toHaveBeenCalled();
      expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
        'admin_user_2', // Recipient
        'LEAD_ASSIGNED',
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
      expect(mockSocketService.broadcastToRoom).toHaveBeenCalledWith(
        'admin_admin_user_2',
        'lead_assigned',
        expect.any(Object)
      );
    });

    it('should kick out old assignee if reassigned', async () => {
        const oldWorkerId = 'worker1';
        
        // 1. Mock Old Lead having an old assignment
        mockLead.findById.mockResolvedValue({ _id: leadId, assignedTo: oldWorkerId });
        
        // 2. Update Mock
        const updatedLead = { _id: leadId, assignedTo: { _id: newAssigneeId } };
        mockLead.findByIdAndUpdate.mockReturnValue(mockMongooseChain(updatedLead));

        // FIX: Use mockReturnValue(mockMongooseChain)
        mockAdmin.find.mockReturnValue(mockMongooseChain([{ _id: 'admin_user_1' }]));

        await leadService.assignLead(leadId, newAssigneeId, adminInfo);

        // Check if kick-out event was emitted
        expect(mockSocketService.broadcastToRoom).toHaveBeenCalledWith(
            `lead_${leadId}`,
            'lead_access_revoked',
            expect.objectContaining({ reason: 'reassigned' })
        );
    });
  });

  // =================================================================
  // TEST: updateLeadStatus
  // =================================================================
  describe('updateLeadStatus', () => {
    it('should update status and log activity', async () => {
      const adminInfo = { id: 'admin1' };
      const oldLead = { status: 'New', assignedTo: 'worker1', fullName: 'Client' };
      
      // Mock findById for oldLead
      mockLead.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(oldLead) })
      });

      // Mock findByIdAndUpdate
      mockLead.findByIdAndUpdate.mockReturnValue(mockMongooseChain(oldLead));

      // Mock Admin.find (for getAdminIdsForWorkerProfile)
      // FIX: Use mockReturnValue(mockMongooseChain)
      mockAdmin.find.mockReturnValue(mockMongooseChain([{ _id: 'admin_user_1' }]));

      await leadService.updateLeadStatus('lead1', 'Contacted', adminInfo);

      expect(mockLead.findByIdAndUpdate).toHaveBeenCalledWith(
        'lead1',
        { status: 'Contacted' },
        expect.any(Object)
      );
      
      // Verify activity log call
      expect(mockActivityService.logSystemActivity).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'status_change', content: 'Status changed to Contacted' })
      );
    });
  });

  // =================================================================
  // TEST: bulkDeleteLeads
  // =================================================================
  describe('bulkDeleteLeads', () => {
    it('should delete multiple leads and notify owners', async () => {
      const payload = {
        leadIds: ['lead1', 'lead2'],
        selectAll: false,
        adminInfo: { id: 'superadmin1', name: 'Boss' }
      };

      // Mock finding assignments before delete
      mockLead.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'lead1', assignedTo: 'worker1' },
            { _id: 'lead2', assignedTo: 'worker1' }
          ])
        })
      });

      // FIX: Use mockReturnValue(mockMongooseChain)
      mockAdmin.find.mockReturnValue(mockMongooseChain([{ _id: 'admin_worker_1' }]));
      
      mockLeadActivity.deleteMany.mockResolvedValue({ deletedCount: 10 });
      mockLead.deleteMany.mockResolvedValue({ deletedCount: 2 });
      
      // Also need to mock socketService.getIO() for the kick-out loop
      mockSocketService.getIO.mockReturnValue({
          to: jest.fn().mockReturnThis(),
          emit: jest.fn()
      });

      const result = await leadService.bulkDeleteLeads(payload);

      expect(mockLead.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['lead1', 'lead2'] } });
      
      // Check notification to the affected worker
      expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
        'admin_worker_1',
        'LEAD_DELETED',
        expect.any(String),
        expect.stringContaining('2 of your leads were deleted'), // 2 leads for worker1
        expect.any(Object)
      );

      // Check Realtime Grid Refresh for that worker
      expect(mockSocketService.broadcastToRoom).toHaveBeenCalledWith(
        'admin_admin_worker_1',
        'bulk_leads_deleted',
        expect.objectContaining({ count: 2, silent: true })
      );

      expect(result.deletedLeads).toBe(2);
    });
  });

// =================================================================
  // TEST: createLeadManually
  // =================================================================
  describe('createLeadManually', () => {
    it('should create lead with only required fields (relaxed validation)', async () => {
      const input = {
        // fullName and email are deliberately omitted to test relaxed validation
        phoneNumber: '1234567890',
        inquiryType: 'buying',
        assignedTo: '' // Should be converted to null
      };

      mockLead.create.mockImplementation((data) => Promise.resolve({ _id: 'new1', ...data }));

      const result = await leadService.createLeadManually(input, { id: 'admin1', name: 'Admin' });

      expect(result.assignedTo).toBeNull();
      expect(mockLead.create).toHaveBeenCalled();
      
      // Unassigned = Notify superadmins
      expect(mockNotificationService.notifySuperAdmins).toHaveBeenCalled();
    });

    it('should throw an error if phoneNumber or inquiryType is missing', async () => {
      const invalidInput = { fullName: 'No Phone' }; // Missing required fields
      
      await expect(leadService.createLeadManually(invalidInput, { id: 'admin1' }))
        .rejects.toThrow(AppError);
    });
  });

  // =================================================================
  // TEST: updateLeadDetails
  // =================================================================
  describe('updateLeadDetails', () => {
    it('should update lead details and log activity', async () => {
      const leadId = 'lead1';
      const updateData = { fullName: 'Updated Name', phoneNumber: '999', email: 'up@date.com', message: 'hello' };
      const adminInfo = { id: 'admin1', name: 'Admin One' };
      
      const mockUpdatedLead = { 
        _id: leadId, 
        ...updateData, 
        assignedTo: { _id: 'worker1', translations: { en: { name: 'Worker' } } } 
      };
      
      // Mock the DB update
      mockLead.findByIdAndUpdate.mockReturnValue(mockMongooseChain(mockUpdatedLead));
      
      // Mock finding the admin ID for the assigned worker
      mockAdmin.find.mockReturnValue(mockMongooseChain([{ _id: 'admin_worker_1' }]));

      const result = await leadService.updateLeadDetails(leadId, updateData, adminInfo);

      // Verify DB was called correctly
      expect(mockLead.findByIdAndUpdate).toHaveBeenCalledWith(
        leadId,
        expect.objectContaining({ fullName: 'Updated Name', phoneNumber: '999' }),
        expect.any(Object)
      );
      
      // Verify Activity was logged
      expect(mockActivityService.logSystemActivity).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'update', content: 'Lead contact details or memo updated' })
      );
      
      // Verify Real-time Socket was fired
      expect(mockSocketService.broadcastToRoom).toHaveBeenCalledWith(
        `lead_${leadId}`, 'lead_activity_refresh', { leadId }
      );
      
      expect(result).toEqual(mockUpdatedLead);
    });
  });


});