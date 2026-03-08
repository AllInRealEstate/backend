const courseService = require('../../services/courseService');
const Course = require('../../models/Course');
const supabaseService = require('../../services/supabaseService'); 

jest.mock('../../models/Course');
jest.mock('../../services/supabaseService');

describe('CourseService Unit Tests', () => {
  
  beforeEach(() => {
    // CRITICAL FIX: Ensure deleteFile returns a Promise so .catch() doesn't crash
    supabaseService.deleteFile.mockResolvedValue(true); 
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- 1. GET WEBSITE COURSES ---
  describe('getWebsiteCourses', () => {
    it('should fetch active courses and flatten translations', async () => {
      const mockCourses = [{
        _id: 'c1',
        active: true,
        price: 100,
        currency: 'USD',
        translations: { en: { title: 'Test Course' } },
        featured: true
      }];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockCourses),
        limit: jest.fn().mockReturnThis()
      };
      
      Course.find.mockReturnValue(mockQuery);

      const result = await courseService.getWebsiteCourses('en');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Course');
    });
  });

  // --- 2. CREATE COURSE ---
  describe('createCourse', () => {
    it('should upload file and create course', async () => {
      const mockFile = { originalname: 'test.jpg', buffer: Buffer.from('data'), mimetype: 'image/jpeg' };
      const mockData = { title: 'New Course' };
      const mockCreatedCourse = { ...mockData, image: 'supa-url' };

      supabaseService.uploadFile.mockResolvedValue('supa-url');
      Course.create.mockResolvedValue(mockCreatedCourse);

      const result = await courseService.createCourse(mockData, mockFile);

      expect(supabaseService.uploadFile).toHaveBeenCalled();
      expect(Course.create).toHaveBeenCalledWith(expect.objectContaining({
        image: 'supa-url'
      }));
      expect(result).toEqual(mockCreatedCourse);
    });

    it('should delete uploaded file if DB creation fails (Rollback)', async () => {
      const mockFile = { originalname: 'test.jpg', buffer: Buffer.from('data'), mimetype: 'image/jpeg' };
      
      // 1. Upload succeeds
      supabaseService.uploadFile.mockResolvedValue('supa-url');
      // 2. DB Creation fails
      Course.create.mockRejectedValue(new Error('DB Error'));

      await expect(courseService.createCourse({}, mockFile))
        .rejects.toThrow('DB Error');

      // 3. Verify Rollback
      expect(supabaseService.deleteFile).toHaveBeenCalledWith('supa-url');
    });
  });

  // --- 3. DELETE COURSE ---
  describe('deleteCourse', () => {
    it('should delete file from supabase and doc from DB', async () => {
      const mockCourse = { 
        _id: '123', 
        image: 'https://supabase.com/img.jpg', // Must include 'supabase' to trigger deletion
        deleteOne: jest.fn() 
      };

      Course.findById.mockResolvedValue(mockCourse);

      await courseService.deleteCourse('123');

      expect(supabaseService.deleteFile).toHaveBeenCalledWith(mockCourse.image);
      expect(mockCourse.deleteOne).toHaveBeenCalled();
    });
  });
});