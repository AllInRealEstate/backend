const httpMocks = require('node-mocks-http');
const notificationController = require('../../controllers/notificationController');
const notificationService = require('../../services/notificationService');

jest.mock('../../services/notificationService');

describe('NotificationController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn();
    
    // ✅ FIX: Changed from req.user to req.admin (matching the controller)
    req.admin = { _id: 'user123' };
    jest.clearAllMocks();
  });

  describe('getMyNotifications', () => {
    it('should call service with admin ID and pagination', async () => {
      req.query = { page: '2', limit: '5' };
      
      notificationService.getUserNotifications.mockResolvedValue({
        notifications: [],
        total: 0,
        unreadCount: 0,
        page: 2,
        pages: 0
      });

      await notificationController.getMyNotifications(req, res, next);

      // ✅ FIX: Service is called with req.admin._id (not req.user._id)
      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        'user123',
        2,
        5
      );
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({
        success: true,
        data: {
          notifications: [],
          total: 0,
          unreadCount: 0,
          page: 2,
          pages: 0
        }
      });
    });
  });

  describe('markRead', () => {
    it('should return 404 if notification not found/owned', async () => {
      req.params.id = 'notif1';
      notificationService.markAsRead.mockResolvedValue(null);

      await notificationController.markRead(req, res, next);

      expect(res.statusCode).toBe(404);
      expect(res._getJSONData()).toEqual({
        success: false,
        message: expect.any(String) // Will be ERROR.NOTIFICATION_NOT_FOUND
      });
    });

    it('should return 200 if updated', async () => {
      req.params.id = 'notif1';
      const mockNotification = { 
        _id: 'notif1', 
        isRead: true,
        recipient: 'user123',
        type: 'LEAD_ASSIGNED',
        title: 'Test',
        message: 'Test message'
      };
      
      notificationService.markAsRead.mockResolvedValue(mockNotification);

      await notificationController.markRead(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().success).toBe(true);
      expect(res._getJSONData().data.isRead).toBe(true);
    });
  });

  describe('markAllRead', () => {
    it('should call markAllAsRead service', async () => {
      notificationService.markAllAsRead.mockResolvedValue({ modifiedCount: 5 });

      await notificationController.markAllRead(req, res, next);

      expect(notificationService.markAllAsRead).toHaveBeenCalledWith('user123');
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({
        success: true,
        message: expect.any(String) // SUCCESS.MARKED_ALL_READ
      });
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      notificationService.getUnreadCount.mockResolvedValue(7);

      await notificationController.getUnreadCount(req, res, next);

      expect(notificationService.getUnreadCount).toHaveBeenCalledWith('user123');
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({
        success: true,
        count: 7
      });
    });
  });

  describe('deleteNotification', () => {
    it('should return 404 if notification not found', async () => {
      req.params.id = 'notif1';
      notificationService.deleteNotification.mockResolvedValue(null);

      await notificationController.deleteNotification(req, res, next);

      expect(res.statusCode).toBe(404);
    });

    it('should return 200 if deleted', async () => {
      req.params.id = 'notif1';
      notificationService.deleteNotification.mockResolvedValue({ _id: 'notif1' });

      await notificationController.deleteNotification(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().success).toBe(true);
    });
  });

  describe('deleteAllNotifications', () => {
    it('should delete all notifications for user', async () => {
      notificationService.deleteAllNotifications.mockResolvedValue({ deletedCount: 10 });

      await notificationController.deleteAllNotifications(req, res, next);

      expect(notificationService.deleteAllNotifications).toHaveBeenCalledWith('user123');
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().success).toBe(true);
    });
  });
});