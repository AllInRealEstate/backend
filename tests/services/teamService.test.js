const teamService = require('../../services/teamService');
const TeamMember = require('../../models/TeamMember');
const supabaseService = require('../../services/supabaseService');
const AppError = require('../../utils/AppError');

jest.mock('../../models/TeamMember');
jest.mock('../../services/supabaseService');

describe('TeamService Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- 1. CREATE MEMBER ---
  describe('createMember', () => {
    it('should throw error if license number exists', async () => {
      TeamMember.findOne.mockResolvedValue({ _id: 'existing' });
      
      await expect(teamService.createMember({ licenseNumber: '123' }, null))
        .rejects.toThrow('License number already exists');
    });

    it('should upload image and create member', async () => {
      TeamMember.findOne.mockResolvedValue(null); // No duplicate
      supabaseService.uploadFile.mockResolvedValue('url.jpg');
      TeamMember.create.mockResolvedValue({ _id: 'new', image: 'url.jpg' });

      const mockFile = { originalname: 'test.jpg', buffer: Buffer.from('img') };
      
      const result = await teamService.createMember({ licenseNumber: '123' }, mockFile);

      expect(supabaseService.uploadFile).toHaveBeenCalled();
      expect(result.image).toBe('url.jpg');
    });
  });

  // --- 2. UPDATE MEMBER ---
  describe('updateMember', () => {
    it('should delete old image if new one is uploaded', async () => {
      const mockMember = { _id: 'm1', image: 'supabase.com/old.jpg' };
      TeamMember.findById.mockResolvedValue(mockMember);
      TeamMember.findOne.mockResolvedValue(null); // No license conflict
      TeamMember.findByIdAndUpdate.mockResolvedValue({ _id: 'm1', image: 'new.jpg' });
      
      supabaseService.uploadFile.mockResolvedValue('new.jpg');
      supabaseService.deleteFile.mockResolvedValue(true);

      const mockFile = { originalname: 'new.jpg', buffer: Buffer.from('img') };

      await teamService.updateMember('m1', {}, mockFile);

      // Verify old image deletion
      expect(supabaseService.deleteFile).toHaveBeenCalledWith(mockMember.image);
    });
  });

  // --- 3. DELETE MEMBER ---
  describe('deleteMember', () => {
    it('should delete image and record', async () => {
      const mockMember = { 
        _id: 'm1', 
        image: 'supabase.com/img.jpg', 
        deleteOne: jest.fn() 
      };
      TeamMember.findById.mockResolvedValue(mockMember);

      await teamService.deleteMember('m1');

      expect(supabaseService.deleteFile).toHaveBeenCalledWith(mockMember.image);
      expect(mockMember.deleteOne).toHaveBeenCalled();
    });
  });
});