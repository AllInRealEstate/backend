const Notification = require('../../models/Notification');

describe('Notification Model Unit Tests', () => {
  it('should be defined', () => {
    expect(Notification).toBeDefined();
  });

  it('should require recipient, type, title, and message', () => {
    const notif = new Notification({});
    const error = notif.validateSync();

    expect(error.errors.recipient).toBeDefined();
    expect(error.errors.type).toBeDefined();
    expect(error.errors.title).toBeDefined();
    expect(error.errors.message).toBeDefined();
  });

  it('should default isRead to false', () => {
    const notif = new Notification({
      recipient: '507f1f77bcf86cd799439011',
      type: 'ALERT',
      title: 'T',
      message: 'M'
    });
    
    expect(notif.isRead).toBe(false);
  });
});