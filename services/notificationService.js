const Notification = require('../models/Notification');
const socketService = require('./socket/socketService');

class NotificationService {

  /**
   * Create a notification and emit real-time event
   */
  async createNotification(recipientId, type, title, message, data = {}) {
    // 1. Save to Database
    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title,
      message,
      data
    });
    
    // 2. Emit Real-Time Event
    socketService.emitNotification(recipientId.toString(), notification);

    return notification;
  }

  /**
   * Notify all Super Admins
   */
  async notifySuperAdmins(type, title, message, data = {},excludeUserId = null) {
    const User = require('../models/Admin');
    

    // Filter out the sender
    const query = { role: 'superadmin' };
    if (excludeUserId) {
      query._id = { $ne: excludeUserId }; // ← EXCLUDE LOGIC
    }

    const superAdmins = await User.find(query).select('_id');

    const notificationsData = superAdmins.map(admin => ({
      recipient: admin._id,
      type,
      title,
      message,
      data
    }));

    if (notificationsData.length > 0) {
      // 1. Create Documents and CAPTURE the results (so we have _ids)
      const createdNotifications = await Notification.insertMany(notificationsData);

      // 2. Loop and emit the SPECIFIC document to each specific admin
      // This ensures the frontend gets the correct _id for "Mark as Read"
      createdNotifications.forEach(notification => {
        socketService.emitNotification(notification.recipient.toString(), notification);
      });
    }
  }

  /**
   * Get unread notifications for a user (with pagination)
   */
  async getUserNotifications(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments({ recipient: userId });
    const unreadCount = await Notification.countDocuments({ recipient: userId, isRead: false });

    return { notifications, total, unreadCount, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId, userId) {
    return await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
  }

  /**
   * Mark ALL notifications as read for a user
   */
  async markAllAsRead(userId) {
    return await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
  }

  /**
   * Get only the unread count (optimized)
   */
  async getUnreadCount(userId) {
    return await Notification.countDocuments({
      recipient: userId,
      isRead: false
    });
  }

  /**
 * Delete a notification
 */
  async deleteNotification(notificationId, userId) {
    return await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId
    });
  }


  /**
   * Delete ALL notifications for a user
   */
  async deleteAllNotifications(userId) {
    return await Notification.deleteMany({ recipient: userId });
  }

}

module.exports = new NotificationService();