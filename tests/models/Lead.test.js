const Lead = require('../../models/Lead');
const { LEAD_STATUS } = require('../../constants/constants');

describe('Lead Model Unit Tests', () => {
  describe('Validation: Email Field', () => {
    // Helper function for required fields so we only test email validation
    const getBaseLead = () => ({
      fullName: 'John Doe',
      phoneNumber: '123456789',
      inquiryType: 'buying'
    });

    it('should validate successfully with a correct email', () => {
      const lead = new Lead({ ...getBaseLead(), email: 'test@example.com' });
      const error = lead.validateSync();
      // Only check that the EMAIL field didn't throw an error
      expect(error?.errors?.email).toBeUndefined();
    });

    it('should validate successfully with an empty string email ("")', () => {
      const lead = new Lead({ ...getBaseLead(), email: '' });
      const error = lead.validateSync();
      expect(error?.errors?.email).toBeUndefined();
    });

    it('should validate successfully with a null email', () => {
      const lead = new Lead({ ...getBaseLead(), email: null });
      const error = lead.validateSync();
      expect(error?.errors?.email).toBeUndefined();
    });

    it('should fail validation with an improperly formatted email', () => {
      const lead = new Lead({ ...getBaseLead(), email: 'not-an-email' });
      const error = lead.validateSync();
      // Here we expect the email field specifically to have an error
      expect(error.errors.email).toBeDefined();
      expect(error.errors.email.message).toBe('Please enter a valid email');
    });
  });

  describe('Virtuals: isNew', () => {
    it('should return true if submitted less than 24 hours ago', () => {
      const lead = new Lead({ submittedAt: new Date() });
      expect(lead.isNew).toBe(true);
    });

    it('should return false if submitted more than 24 hours ago', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 2); // 2 days ago
      const lead = new Lead({ submittedAt: oldDate });
      expect(lead.isNew).toBe(false);
    });
  });

  describe('Instance Methods', () => {
    it('markAsContacted should update status and timestamp', async () => {
      const lead = new Lead({ status: 'New' });
      // Mock save function
      lead.save = jest.fn().mockResolvedValue(lead);

      await lead.markAsContacted();

      expect(lead.status).toBe(LEAD_STATUS.CONTACTED);
      expect(lead.contactedAt).toBeInstanceOf(Date);
      expect(lead.save).toHaveBeenCalled();
    });

    it('closeLead should update status and closedAt', async () => {
      const lead = new Lead({ status: 'New' });
      lead.save = jest.fn().mockResolvedValue(lead);

      await lead.closeLead();

      expect(lead.status).toBe(LEAD_STATUS.CLOSED);
      expect(lead.closedAt).toBeInstanceOf(Date);
    });
  });
});