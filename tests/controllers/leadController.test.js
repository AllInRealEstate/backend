const httpMocks = require('node-mocks-http');
const leadController = require('../../controllers/leadController');
const leadService = require('../../services/leadService');
const Admin = require('../../models/Admin');
const Lead = require('../../models/Lead');

// 1. Mock catchAsync so errors flow directly to next() during testing
jest.mock('../../utils/catchAsync', () => (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
});

// 2. Mock all dependencies
jest.mock('../../services/leadService');
jest.mock('../../services/activityService');
jest.mock('../../services/socket/socketService');
jest.mock('../../models/Admin');
jest.mock('../../models/Lead');

describe('LeadController Full Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn();
    
    // Default to Superadmin for most tests
    req.admin = {
      _id: 'superadmin_id',
      role: 'superadmin',
      firstName: 'John',
      lastName: 'Doe',
      workerProfile: { 
        _id: 'worker_1', 
        translations: { en: { name: 'John Doe' } },
        image: 'profile.jpg'
      }
    };
    jest.clearAllMocks();
  });

  // ==========================================
  // 1. getLeads
  // ==========================================
  describe('getLeads', () => {
    it('should fetch leads for superadmin without forcing workerId scope', async () => {
      req.query = { status: 'New' };
      leadService.getFilteredLeads.mockResolvedValue({ leads: [], total: 0, pages: 0, page: 1 });

      await leadController.getLeads(req, res, next);

      // Passed filters, null for workerId (since superadmin), and adminId for badges
      expect(leadService.getFilteredLeads).toHaveBeenCalledWith(
        { status: 'New' }, 
        'worker_1', 
        'superadmin_id'
      );
      expect(res.statusCode).toBe(200);
    });

    it('should force workerId scope if user is a standard admin', async () => {
      req.admin.role = 'admin';
      req.query = { view: 'all' }; // Admin trying to be sneaky
      
      leadService.getFilteredLeads.mockResolvedValue({ leads: [], total: 0, pages: 0, page: 1 });

      await leadController.getLeads(req, res, next);

      expect(leadService.getFilteredLeads).toHaveBeenCalledWith(
        expect.objectContaining({ assignedTo: 'worker_1' }), // Forced scope
        'worker_1',
        'superadmin_id'
      );
      // Ensure 'view' was deleted from filters
      expect(leadService.getFilteredLeads.mock.calls[0][0].view).toBeUndefined();
    });

    it('should return empty array immediately if standard admin has no worker profile', async () => {
      req.admin.role = 'admin';
      req.admin.workerProfile = null;

      await leadController.getLeads(req, res, next);

      expect(leadService.getFilteredLeads).not.toHaveBeenCalled();
      expect(res._getJSONData().data).toEqual([]);
    });
  });

  // ==========================================
  // 2. getLeadById
  // ==========================================
  describe('getLeadById', () => {
    it('should fetch lead by ID and pass admin ID to reset unread badge', async () => {
      req.params.id = 'lead_123';
      leadService.getLeadById.mockResolvedValue({ _id: 'lead_123', fullName: 'Test' });

      await leadController.getLeadById(req, res, next);

      expect(leadService.getLeadById).toHaveBeenCalledWith('lead_123', 'superadmin_id');
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().data.fullName).toBe('Test');
    });
  });

  // ==========================================
  // 3. createLead (Public Form Submission)
  // ==========================================
  describe('createLead', () => {
    it('should return 400 if required fields are missing', async () => {
      req.body = { email: 'test@test.com' }; // missing phone/inquiryType
      
      await leadController.createLead(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('should create lead successfully if fields are valid', async () => {
      req.body = { email: 'test@test.com', phoneNumber: '123', inquiryType: 'buying' };
      req.ip = '127.0.0.1';
      
      leadService.createLead.mockResolvedValue({ _id: 'new_lead' });

      await leadController.createLead(req, res, next);

      expect(leadService.createLead).toHaveBeenCalledWith(req.body, '127.0.0.1');
      expect(res.statusCode).toBe(201);
    });
  });

  // ==========================================
  // 4. updateStatus & updatePriority
  // ==========================================
  describe('updateStatus & updatePriority', () => {
    it('updateStatus should return 400 if status is missing', async () => {
      req.params.id = 'lead_1';
      req.body = {};
      await leadController.updateStatus(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('updateStatus should call service successfully', async () => {
      req.params.id = 'lead_1';
      req.body = { status: 'Contacted' };
      leadService.updateLeadStatus.mockResolvedValue({ _id: 'lead_1', status: 'Contacted' });

      await leadController.updateStatus(req, res, next);
      expect(leadService.updateLeadStatus).toHaveBeenCalledWith('lead_1', 'Contacted', expect.any(Object));
      expect(res.statusCode).toBe(200);
    });

    it('updatePriority should return 400 if priority is missing', async () => {
      req.params.id = 'lead_1';
      req.body = {};
      await leadController.updatePriority(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('updatePriority should call service successfully', async () => {
      req.params.id = 'lead_1';
      req.body = { priority: 'High' };
      leadService.updateLeadPriority.mockResolvedValue({ _id: 'lead_1', priority: 'High' });

      await leadController.updatePriority(req, res, next);
      expect(leadService.updateLeadPriority).toHaveBeenCalledWith('lead_1', 'High', expect.any(Object));
      expect(res.statusCode).toBe(200);
    });
  });

  // ==========================================
  // 5. assignLead
  // ==========================================
  describe('assignLead', () => {
    it('should delegate assignment to service layer', async () => {
      req.params.id = 'lead_1';
      req.body = { assignedTo: 'worker_2' };
      leadService.assignLead.mockResolvedValue({ _id: 'lead_1' });

      await leadController.assignLead(req, res, next);

      expect(leadService.assignLead).toHaveBeenCalledWith('lead_1', 'worker_2', expect.any(Object));
      expect(res.statusCode).toBe(200);
    });
  });

  // ==========================================
  // 6. deleteLead
  // ==========================================
  describe('deleteLead', () => {
    it('should return 403 if standard admin tries to delete', async () => {
      req.admin.role = 'admin';
      await leadController.deleteLead(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it('should allow superadmin to delete lead', async () => {
      req.params.id = 'lead_1';
      leadService.deleteLead.mockResolvedValue({ _id: 'lead_1' });

      await leadController.deleteLead(req, res, next);

      expect(leadService.deleteLead).toHaveBeenCalledWith('lead_1', 'superadmin_id');
      expect(res.statusCode).toBe(200);
    });
  });

  // ==========================================
  // 7. bulkDeleteLeads
  // ==========================================
  describe('bulkDeleteLeads', () => {
    it('should return 403 for standard admins', async () => {
      req.admin.role = 'admin';
      await leadController.bulkDeleteLeads(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it('should pass adminInfo and payload to service for superadmins', async () => {
       req.body = { leadIds: ['1', '2'], selectAll: false };
       leadService.bulkDeleteLeads.mockResolvedValue({ deletedLeads: 2 });
       
       await leadController.bulkDeleteLeads(req, res, next);
       
       expect(leadService.bulkDeleteLeads).toHaveBeenCalledWith(
         expect.objectContaining({
           leadIds: ['1', '2'],
           adminInfo: expect.objectContaining({ id: 'superadmin_id' })
         })
       );
       expect(res.statusCode).toBe(200);
    });
  });

  // ==========================================
  // 8. getStats
  // ==========================================
  describe('getStats', () => {
    it('should force "mine" view for standard admins', async () => {
      req.admin.role = 'admin';
      req.query = { view: 'all' };
      leadService.getLeadStats.mockResolvedValue({ total: 10 });

      await leadController.getStats(req, res, next);

      expect(leadService.getLeadStats).toHaveBeenCalledWith(
        expect.objectContaining({ view: 'mine' }), 
        'worker_1'
      );
      expect(res.statusCode).toBe(200);
    });

    it('should allow superadmin to view all stats', async () => {
      req.query = { view: 'all' };
      leadService.getLeadStats.mockResolvedValue({ total: 100 });

      await leadController.getStats(req, res, next);

      expect(leadService.getLeadStats).toHaveBeenCalledWith(
        expect.objectContaining({ view: 'all' }), 
        'worker_1'
      );
    });
  });

  // ==========================================
  // 9. createLeadManually
  // ==========================================
  describe('createLeadManually', () => {
    it('should block non-superadmins', async () => {
      req.admin.role = 'admin';
      await leadController.createLeadManually(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it('should delegate to service with correct adminInfo', async () => {
      req.body = { phoneNumber: '123', inquiryType: 'buying' };
      leadService.createLeadManually.mockResolvedValue({ _id: 'new1' });

      await leadController.createLeadManually(req, res, next);

      expect(leadService.createLeadManually).toHaveBeenCalledWith(
        req.body,
        expect.objectContaining({ id: 'superadmin_id' })
      );
      expect(res.statusCode).toBe(201);
    });
  });

  // ==========================================
  // 10. bulkAssignLeads
  // ==========================================
  describe('bulkAssignLeads', () => {
    it('should pass payload and adminInfo to service', async () => {
      req.body = { leadIds: ['1'], assignedTo: 'worker_2' };
      leadService.bulkAssignLeads.mockResolvedValue({ updatedCount: 1 });

      await leadController.bulkAssignLeads(req, res, next);

      expect(leadService.bulkAssignLeads).toHaveBeenCalledWith(
        expect.objectContaining({
          leadIds: ['1'],
          assignedTo: 'worker_2',
          adminInfo: expect.objectContaining({ id: 'superadmin_id' })
        })
      );
      expect(res.statusCode).toBe(200);
    });
  });

  // ==========================================
  // 11. getGlobalPlatformStats
  // ==========================================
  describe('getGlobalPlatformStats', () => {
    it('should return platform intelligence correctly', async () => {
      Admin.countDocuments.mockImplementation((query) => {
        if (query.role === 'superadmin') return Promise.resolve(2);
        if (query.role === 'admin') return Promise.resolve(5);
        return Promise.resolve(0);
      });
      Lead.countDocuments.mockImplementation((query) => {
        if (query) return Promise.resolve(10); // leads today
        return Promise.resolve(100); // total leads
      });

      await leadController.getGlobalPlatformStats(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().data).toEqual({
        superAdmins: 2,
        admins: 5,
        totalLeads: 100,
        newToday: 10
      });
    });
  });

  // ==========================================
  // 12. updateLeadDetailsOptimized
  // ==========================================
  describe('updateLeadDetailsOptimized', () => {
    it('should return 400 if phone number is missing', async () => {
      req.params.id = 'lead1';
      req.body = { email: 'test@test.com' }; 

      await leadController.updateLeadDetailsOptimized(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Phone number is strictly required.',
        statusCode: 400
      }));
    });

    it('should apply fallbacks for missing name and email and call service', async () => {
      req.params.id = 'lead1';
      req.body = { phoneNumber: '123456789' }; 

      leadService.updateLeadDetails.mockResolvedValue({ _id: 'lead1', fullName: 'Unknown', email: '' });

      await leadController.updateLeadDetailsOptimized(req, res, next);

      expect(leadService.updateLeadDetails).toHaveBeenCalledWith(
        'lead1',
        expect.objectContaining({
          fullName: 'Unknown',
          email: '',
          phoneNumber: '123456789'
        }),
        expect.any(Object)
      );
      expect(res.statusCode).toBe(200);
    });
  });
});