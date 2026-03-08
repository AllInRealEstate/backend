const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');
const { adminLimiter } = require('../middleware/adminLimiter');


router.use(adminLimiter); 
router.use(protect);

router.get('/', (req, res, next) => notificationController.getMyNotifications(req, res, next));
router.delete('/', (req, res, next) => notificationController.deleteAllNotifications(req, res, next));
router.get('/unread-count', (req, res, next) => notificationController.getUnreadCount(req, res, next)); 
router.patch('/read-all', (req, res, next) => notificationController.markAllRead(req, res, next));
router.patch('/:id/read', (req, res, next) => notificationController.markRead(req, res, next));
router.delete('/:id', (req, res, next) => notificationController.deleteNotification(req, res, next));
module.exports = router;