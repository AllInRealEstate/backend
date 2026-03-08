const nodemailer = require('nodemailer');

// 1. Tell Jest to automatically mock the entire nodemailer library
jest.mock('nodemailer');

// 2. Create our mock function
const mockSendMail = jest.fn();

// 3. Attach our mock function to the mocked createTransport method
nodemailer.createTransport.mockReturnValue({
  sendMail: mockSendMail
});

// 4. NOW it is safe to import our service
const emailService = require('../../services/emailServiceNodeMailer');

describe('External Service: Email (Nodemailer)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, GMAIL_USER: 'test@gmail.com', GMAIL_APP_PASSWORD: 'password123' };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('sendLeadNotification should construct correct HTML email', async () => {
    const mockLead = {
      fullName: 'Test User',
      email: 'test@user.com',
      phoneNumber: '1234567890',
      inquiryType: 'Buying',
      source: 'Website'
    };

    mockSendMail.mockResolvedValue({ messageId: '123' });

    // Simulate sending to an admin
    await emailService.sendLeadNotification(mockLead, ['admin@test.com']);

    // Verify Nodemailer was called correctly
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const callArgs = mockSendMail.mock.calls[0][0];

    expect(callArgs.to).toBe('admin@test.com');
    expect(callArgs.subject).toContain('New Lead: Test User');
    
    // Verify HTML Content
    expect(callArgs.html).toContain('Test User');
    expect(callArgs.html).toContain('test@user.com');
    expect(callArgs.html).toContain('1234567890');
  });

  test('should safely skip and warn if no valid recipients are provided', async () => {
    // Send with an empty array (testing our Guard Clause!)
    const result = await emailService.sendLeadNotification({ fullName: 'Skip me' }, []);
    
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Email skipped'));
  });

  test('should handle API errors gracefully', async () => {
    // Force Nodemailer to throw an error
    mockSendMail.mockRejectedValue(new Error('SMTP Error'));

    const result = await emailService.sendLeadNotification({ fullName: 'Fail' }, ['admin@test.com']);
    
    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith('❌ Gmail SMTP Error:', expect.any(Error));
  });
});