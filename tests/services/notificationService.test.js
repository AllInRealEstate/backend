/**
 * tests/services/notificationService.test.js
 * ✅ FIXED:
 * - Proper mock setup for insertMany to return array
 * - Correct socket service mock structure
 * - Fixed io.to() and io.emit() chain mocking
 */

const notificationService = require('../../services/notificationService');
const Notification = require('../../models/Notification');
const Admin = require('../../models/Admin');

// --- MOCKS ---

// 1. Mock the Models
jest.mock('../../models/Notification');
jest.mock('../../models/Admin');

// 2. Mock the Socket Service (not socket config directly)
jest.mock('../../services/socket/socketService', () => ({
  emitNotification: jest.fn(),
  getIO: jest.fn()
}));

const socketService = require('../../services/socket/socketService');

describe('NotificationService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- 1. CREATE NOTIFICATION ---
  describe('createNotification', () => {
    it('should save to DB and emit socket event to user room', async () => {
      const recipientId = 'user123';
      const mockNotif = { 
        _id: 'n1', 
        title: 'Test', 
        recipient: recipientId,
        type: 'INFO',
        message: 'Test message'
      };

      // ✅ Mock Notification.create to return the notification
      Notification.create.mockResolvedValue(mockNotif);

      await notificationService.createNotification(
        recipientId, 
        'INFO', 
        'Test', 
        'Msg'
      );

      // ✅ Check DB call
      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: recipientId,
          type: 'INFO',
          title: 'Test',
          message: 'Msg'
        })
      );

      // ✅ Check Socket Service call
      expect(socketService.emitNotification).toHaveBeenCalledWith(
        recipientId.toString(),
        mockNotif
      );
    });
  });

  // --- 2. NOTIFY SUPER ADMINS ---
  describe('notifySuperAdmins', () => {
    it('should find superadmins, insert batch, and emit socket events', async () => {
      const mockAdmins = [
        { _id: 'admin1' }, 
        { _id: 'admin2' }
      ];

      // ✅ Mock the created notifications with proper structure
      const mockCreatedNotifications = [
        {
          _id: 'notif1',
          recipient: 'admin1',
          type: 'ALERT',
          title: 'Title',
          message: 'Msg'
        },
        {
          _id: 'notif2',
          recipient: 'admin2',
          type: 'ALERT',
          title: 'Title',
          message: 'Msg'
        }
      ];

      // ✅ Mock Admin.find() chain
      Admin.find.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockAdmins)
      });

      // ✅ CRITICAL FIX: insertMany must return an ARRAY
      Notification.insertMany.mockResolvedValue(mockCreatedNotifications);

      await notificationService.notifySuperAdmins('ALERT', 'Title', 'Msg');

      // ✅ Verify it looked for superadmins
      expect(Admin.find).toHaveBeenCalledWith({ role: 'superadmin' });

      // ✅ Verify it tried to save 2 notifications
      expect(Notification.insertMany).toHaveBeenCalledTimes(1);
      const insertedData = Notification.insertMany.mock.calls[0][0];
      expect(insertedData).toHaveLength(2);
      expect(insertedData[0]).toMatchObject({
        recipient: 'admin1',
        type: 'ALERT',
        title: 'Title',
        message: 'Msg'
      });

      // ✅ Verify Socket emissions (one per admin)
      expect(socketService.emitNotification).toHaveBeenCalledTimes(2);
      expect(socketService.emitNotification).toHaveBeenCalledWith(
        'admin1',
        expect.objectContaining({ _id: 'notif1' })
      );
      expect(socketService.emitNotification).toHaveBeenCalledWith(
        'admin2',
        expect.objectContaining({ _id: 'notif2' })
      );
    });

    it('should exclude specific user when excludeUserId is provided', async () => {
      const mockAdmins = [{ _id: 'admin2' }]; // Only admin2, admin1 excluded

      Admin.find.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockAdmins)
      });

      const mockCreatedNotification = [{
        _id: 'notif2',
        recipient: 'admin2',
        type: 'INFO',
        title: 'Test',
        message: 'Message'
      }];

      Notification.insertMany.mockResolvedValue(mockCreatedNotification);

      await notificationService.notifySuperAdmins(
        'INFO', 
        'Test', 
        'Message', 
        {}, 
        'admin1' // Exclude admin1
      );

      // ✅ Verify query includes exclusion
      expect(Admin.find).toHaveBeenCalledWith({
        role: 'superadmin',
        _id: { $ne: 'admin1' }
      });

      // ✅ Should only insert 1 notification
      expect(Notification.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({
          recipient: 'admin2'
        })
      ]);
    });

    it('should handle empty superadmin list gracefully', async () => {
      // ✅ Mock no superadmins found
      Admin.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      await notificationService.notifySuperAdmins('INFO', 'Test', 'Message');

      // ✅ Should not attempt to insert or emit
      expect(Notification.insertMany).not.toHaveBeenCalled();
      expect(socketService.emitNotification).not.toHaveBeenCalled();
    });
  });

  // --- 3. GET USER NOTIFICATIONS ---
  describe('getUserNotifications', () => {
    it('should return paginated results with unread count', async () => {
      const mockData = [
        { _id: 'n1', title: 'A', isRead: false },
        { _id: 'n2', title: 'B', isRead: true }
      ];
      
      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockData)
      };
      
      Notification.find.mockReturnValue(mockFind);
      Notification.countDocuments
        .mockResolvedValueOnce(10)  // Total
        .mockResolvedValueOnce(2);  // Unread

      const result = await notificationService.getUserNotifications('u1', 1, 10);

      expect(result.notifications).toEqual(mockData);
      expect(result.total).toBe(10);
      expect(result.unreadCount).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pages).toBe(1); // Math.ceil(10 / 10)
    });

    it('should handle pagination correctly', async () => {
      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };
      
      Notification.find.mockReturnValue(mockFind);
      Notification.countDocuments
        .mockResolvedValueOnce(25)  // Total
        .mockResolvedValueOnce(5);  // Unread

      const result = await notificationService.getUserNotifications('u1', 2, 10);

      expect(result.page).toBe(2);
      expect(result.pages).toBe(3); // Math.ceil(25 / 10)
      expect(mockFind.skip).toHaveBeenCalledWith(10); // (2-1) * 10
    });
  });

  // --- 4. MARK READ ---
  describe('markAsRead', () => {
    it('should update specific notification', async () => {
      const mockUpdatedNotif = {
        _id: 'n1',
        recipient: 'u1',
        isRead: true,
        readAt: expect.any(Date)
      };

      Notification.findOneAndUpdate.mockResolvedValue(mockUpdatedNotif);

      const result = await notificationService.markAsRead('n1', 'u1');

      expect(Notification.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'n1', recipient: 'u1' },
        { isRead: true, readAt: expect.any(Date) },
        { new: true }
      );

      expect(result).toEqual(mockUpdatedNotif);
    });

    it('should return null if notification not found', async () => {
      Notification.findOneAndUpdate.mockResolvedValue(null);

      const result = await notificationService.markAsRead('invalid', 'u1');

      expect(result).toBeNull();
    });
  });

  // --- 5. MARK ALL AS READ ---
  describe('markAllAsRead', () => {
    it('should update all unread notifications for user', async () => {
      const mockResult = { modifiedCount: 5 };
      Notification.updateMany.mockResolvedValue(mockResult);

      const result = await notificationService.markAllAsRead('u1');

      expect(Notification.updateMany).toHaveBeenCalledWith(
        { recipient: 'u1', isRead: false },
        { isRead: true, readAt: expect.any(Date) }
      );

      expect(result).toEqual(mockResult);
    });
  });

  // --- 6. GET UNREAD COUNT ---
  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      Notification.countDocuments.mockResolvedValue(7);

      const count = await notificationService.getUnreadCount('u1');

      expect(Notification.countDocuments).toHaveBeenCalledWith({
        recipient: 'u1',
        isRead: false
      });

      expect(count).toBe(7);
    });
  });

  // --- 7. DELETE NOTIFICATION ---
  describe('deleteNotification', () => {
    it('should delete specific notification', async () => {
      const mockDeletedNotif = { _id: 'n1', recipient: 'u1' };
      Notification.findOneAndDelete.mockResolvedValue(mockDeletedNotif);

      const result = await notificationService.deleteNotification('n1', 'u1');

      expect(Notification.findOneAndDelete).toHaveBeenCalledWith({
        _id: 'n1',
        recipient: 'u1'
      });

      expect(result).toEqual(mockDeletedNotif);
    });
  });

  // --- 8. DELETE ALL NOTIFICATIONS ---
  describe('deleteAllNotifications', () => {
    it('should delete all notifications for user', async () => {
      const mockResult = { deletedCount: 10 };
      Notification.deleteMany.mockResolvedValue(mockResult);

      const result = await notificationService.deleteAllNotifications('u1');

      expect(Notification.deleteMany).toHaveBeenCalledWith({
        recipient: 'u1'
      });

      expect(result).toEqual(mockResult);
    });
  });
});