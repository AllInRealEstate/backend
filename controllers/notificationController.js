const notificationService = require('../services/notificationService');
const { ERROR, SUCCESS } = require('../constants/ToastMessages');

class NotificationController {

  // GET /api/notifications
  async getMyNotifications(req, res, next) {
    try {
      const { page, limit } = req.query;
      const result = await notificationService.getUserNotifications(
        req.admin._id,  // ✅ FIXED - Changed to req.admin
        parseInt(page) || 1,
        parseInt(limit) || 20
      );

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/notifications/unread-count
  async getUnreadCount(req, res, next) {
    try {
      const count = await notificationService.getUnreadCount(req.admin._id); // ✅ FIXED

      res.status(200).json({
        success: true,
        count
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/notifications/:id/read
  async markRead(req, res, next) {
    try {
      const updated = await notificationService.markAsRead(req.params.id, req.admin._id); // ✅ FIXED

      if (!updated) {
        return res.status(404).json({ success: false, message: ERROR.NOTIFICATION_NOT_FOUND });
      }

      res.status(200).json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/notifications/read-all
  async markAllRead(req, res, next) {
    try {
      await notificationService.markAllAsRead(req.admin._id); 

      res.status(200).json({
        success: true,
        message: SUCCESS.MARKED_ALL_READ
      });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/notifications/:id
  async deleteNotification(req, res, next) {
    try {
      const deleted = await notificationService.deleteNotification(req.params.id, req.admin._id); // ✅ FIXED

      if (!deleted) {
        return res.status(404).json({ success: false, message: ERROR.NOTIFICATION_NOT_FOUND });
      }

      res.status(200).json({
        success: true,
        message: SUCCESS.NOTIFICATION_DELETED
      });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/notifications (Delete ALL)
  async deleteAllNotifications(req, res, next) {
    try {
      await notificationService.deleteAllNotifications(req.admin._id);

      res.status(200).json({
        success: true,
        message: SUCCESS.ALL_NOTIFICATIONS_DELETED
      });
    } catch (error) {
      next(error);
    }
  }

}

module.exports = new NotificationController();