const Admin = require('../../models/Admin');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock external libraries
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('Admin Model Methods', () => {
  
  describe('matchPassword', () => {
    it('should return true if passwords match', async () => {
      bcrypt.compare.mockResolvedValue(true);
      
      const admin = new Admin({ password: 'hashedPassword' });
      
      const isMatch = await admin.matchPassword('plainPassword');
      expect(isMatch).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('plainPassword', 'hashedPassword');
    });
  });

  describe('getSignedJwtToken', () => {
    it('should return a signed token with correct payload', () => {
      jwt.sign.mockReturnValue('mock_token');
      
      // 1. Create the instance (Mongoose will auto-generate a valid _id)
      const admin = new Admin({ role: 'admin', tokenVersion: 0 });
      
      // 2. Run the method
      const token = admin.getSignedJwtToken();
      
      // 3. Verify
      expect(token).toBe('mock_token');
      
      // check that the ID inside the token matches the ID of the admin instance
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ 
          id: admin._id,  // <--- KEY FIX: Use the actual generated ID
          role: 'admin',
          version: 0 
        }),
        expect.any(String), // secret key
        expect.any(Object)  // options
      );
    });
  });
});