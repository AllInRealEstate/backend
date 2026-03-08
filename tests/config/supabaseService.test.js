// 1. Define Mocks FIRST
const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockRemove = jest.fn();

// 2. Mock Sharp Globally
// ✅ RENAME: Must start with 'mock' to be visible inside jest.mock()
const mockSharpSpy = jest.fn(); 

jest.mock('sharp', () => {
  return jest.fn((...args) => {
    mockSharpSpy(...args); // Track calls using the mock-prefixed variable
    return {
      resize: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('compressed-content'))
    };
  });
});

// 3. Mock Supabase Globally
const mockFullClient = {
  storage: {
    from: jest.fn(() => ({
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
      remove: mockRemove
    }))
  }
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockFullClient)
}));

describe('External Service: Supabase', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSharpSpy.mockClear(); 
    
    process.env = { 
      ...originalEnv, 
      SUPABASE_URL: 'https://test.supabase.co', 
      SUPABASE_SERVICE_KEY: 'test-key',
      SUPABASE_BUCKET: 'media'
    };
    
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => {}); 
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // --- PART A: CONFIG TEST (Requires Reset) ---
  describe('Configuration (Singleton)', () => {
    test('connectSupabase should return singleton instance', () => {
      jest.resetModules(); // Clear cache
      const connectSupabase = require('../../config/supabase');
      const { createClient } = require('@supabase/supabase-js');

      connectSupabase();
      connectSupabase();

      // Should be called only once despite two invocations
      expect(createClient).toHaveBeenCalledTimes(1);
    });

    test('should exit process if keys are missing', () => {
      jest.resetModules();
      delete process.env.SUPABASE_URL;
      
      const connectSupabase = require('../../config/supabase');
      connectSupabase();

      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  // --- PART B: SERVICE LOGIC TEST ---
  describe('Service Logic', () => {
    let supabaseService;

    beforeEach(() => {
      // We DO NOT use jest.resetModules() here to keep the mocks stable
      // We just need to make sure the service is loaded
      supabaseService = require('../../services/supabaseService');
    });

    test('uploadFile should compress (call sharp) if file is large', async () => {
      mockUpload.mockResolvedValue({ data: { path: 'img.jpg' }, error: null });
      mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'http://url.com/img.jpg' } });

      // 200KB Buffer -> Should trigger compression (>100KB)
      const largeBuffer = Buffer.alloc(200 * 1024); 
      
      const url = await supabaseService.uploadFile(largeBuffer, 'test.jpg', 'image/jpeg');

      // Check our custom spy
      expect(mockSharpSpy).toHaveBeenCalled();
      
      expect(mockUpload).toHaveBeenCalledWith(
        'test.jpg',
        expect.anything(),
        expect.objectContaining({ contentType: 'image/jpeg' })
      );
    });

    test('uploadFile should retry on failure', async () => {
      const error = new Error('Network blip');
      mockUpload
        .mockResolvedValueOnce({ error })
        .mockResolvedValueOnce({ error })
        .mockResolvedValue({ data: {}, error: null });

      mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'url' } });

      await supabaseService.uploadFile(Buffer.from('data'), 'retry.jpg', 'image/png');

      expect(mockUpload).toHaveBeenCalledTimes(3);
    });

    test('deleteFile should remove file from bucket', async () => {
      const fileUrl = 'https://supabase.co/storage/v1/object/public/media/folder/file.jpg';
      await supabaseService.deleteFile(fileUrl);

      expect(mockRemove).toHaveBeenCalledWith(['folder/file.jpg']);
    });
  });
});