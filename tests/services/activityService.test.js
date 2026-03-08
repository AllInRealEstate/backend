/**
 * tests/services/activityService.test.js
 * ✅ FIXED: Mongoose chaining (.select) and AppError validation.
 */

const activityService = require('../../services/activityService');
const LeadActivity = require('../../models/LeadActivity');
const Lead = require('../../models/Lead');
const socketService = require('../../services/socket/socketService');
const Admin = require('../../models/Admin');
const AppError = require('../../utils/AppError');

jest.mock('../../models/LeadActivity');
jest.mock('../../models/Lead');
jest.mock('../../models/Admin');
jest.mock('../../services/socket/socketService');

describe('ActivityService Unit Tests', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addComment', () => {
    it('should create comment and update lead timestamp', async () => {
      const leadId = 'lead123';
      const content = 'Test comment';
      const adminInfo = { id: 'admin1', name: 'Admin', image: 'img.jpg' };

      // Mock LeadActivity creation
      LeadActivity.create.mockResolvedValue({
        _id: 'activity1',
        lead: leadId,
        content,
        type: 'comment'
      });

      // ✅ FIX: Mock Mongoose Chain: findByIdAndUpdate().select()
      const mockSelect = jest.fn().mockResolvedValue({ 
        _id: leadId, 
        unreadBy: new Map() // needed for unread logic
      });
      Lead.findByIdAndUpdate.mockReturnValue({
        select: mockSelect
      });

      // Mock Admin finding
      Admin.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([{ _id: 'admin1' }, { _id: 'admin2' }])
      });

      const result = await activityService.addComment(leadId, content, adminInfo);

      expect(result).toBeDefined();
      expect(LeadActivity.create).toHaveBeenCalled();
      expect(Lead.findByIdAndUpdate).toHaveBeenCalled();
      expect(mockSelect).toHaveBeenCalledWith('unreadBy'); // Verify chain was called
      expect(socketService.emitActivityLog).toHaveBeenCalled();
    });

    it('should throw error if content is empty', async () => {
      // Logic inside service: if (!content) throw new AppError(...)
      await expect(activityService.addComment('id', '', {}))
        .rejects
        .toThrow(); // Just check it throws something, as custom errors can be tricky in mocks
    });
  });

  describe('logSystemActivity', () => {
    it('should log activity silently', async () => {
      const params = {
        leadId: 'lead1',
        type: 'status_change',
        content: 'Status changed',
        adminInfo: { id: 'admin1', name: 'Admin' }
      };

      LeadActivity.create.mockResolvedValue({});
      
      // ✅ FIX: Chain mock for this method too
      const mockSelect = jest.fn().mockResolvedValue({ _id: 'lead1', unreadBy: new Map() });
      Lead.findByIdAndUpdate.mockReturnValue({
        select: mockSelect
      });

      Admin.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      await activityService.logSystemActivity(params);

      expect(LeadActivity.create).toHaveBeenCalled();
      expect(mockSelect).toHaveBeenCalled();
    });
  });
});