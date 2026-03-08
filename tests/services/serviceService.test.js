const serviceService = require('../../services/serviceService');
const Service = require('../../models/Service');
const supabaseService = require('../../services/supabaseService');

jest.mock('../../models/Service');
jest.mock('../../services/supabaseService');

// Mock Sharp
jest.mock('sharp', () => () => ({
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized-buffer'))
}));

describe('ServiceService Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- 1. CREATE SERVICE (With Sharp Processing) ---
  describe('createService', () => {
    it('should process image with sharp and upload', async () => {
      const mockFile = { originalname: 'icon.png', buffer: Buffer.from('raw') };
      
      supabaseService.uploadFile.mockResolvedValue('http://supa/icon.png');
      Service.create.mockResolvedValue({ _id: 's1', icon: 'http://supa/icon.png' });

      await serviceService.createService({ title: 'Test' }, mockFile);

      expect(supabaseService.uploadFile).toHaveBeenCalledWith(
        Buffer.from('resized-buffer'),
        expect.stringContaining('.png'),
        'image/jpeg'
      );
    });
  });

  // --- 2. GET WEBSITE SERVICES ---
  describe('getWebsiteServices', () => {
    it('should format services and project counts', async () => {
      // CRITICAL FIX: 'relatedProjects' must be objects with translations, not strings
      const mockServices = [{
        _id: 's1',
        translations: { en: { title: 'Legal' } },
        relatedProjects: [
          { _id: 'p1', translations: { en: { title: 'Project A' } } },
          { _id: 'p2', translations: { en: { title: 'Project B' } } }
        ]
      }];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockServices)
      };
      Service.find.mockReturnValue(mockQuery);

      const result = await serviceService.getWebsiteServices('en');

      expect(result[0].title).toBe('Legal');
      expect(result[0].projectCount).toBe(2);
      expect(result[0].relatedProjects[0].title).toBe('Project A');
    });
  });
});