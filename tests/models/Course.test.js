const Course = require('../../models/Course');

// ❌ REMOVED: jest.mock('../../models/Course'); 
// We must use the REAL model to test its virtuals and logic.

describe('Course Model Unit Tests', () => {
  
  afterEach(() => {
    jest.restoreAllMocks(); // Cleans up spies after each test
  });

  // --- 1. Virtuals (Testing the REAL logic) ---
  describe('Virtuals: formattedPrice', () => {
    it('should return "Free" if price is 0 or null', () => {
      // Since we aren't mocking the class, 'new Course' runs the REAL Mongoose schema code
      const courseFree = new Course({ price: 0, currency: 'USD' });
      expect(courseFree.formattedPrice).toBe('Free');

      const courseNull = new Course({ price: null });
      expect(courseNull.formattedPrice).toBe('Free');
    });

    it('should format currency correctly (ILS/USD)', () => {
      const courseILS = new Course({ price: 100, currency: 'ILS' });
      expect(courseILS.formattedPrice).toBe('₪100');

      const courseUSD = new Course({ price: 50, currency: 'USD' });
      expect(courseUSD.formattedPrice).toBe('$50');
    });
  });

  // --- 2. Static Methods (Spying on DB calls) ---
  describe('getDashboardCoursesOptimized', () => {
    it('should flatten translations correctly', async () => {
      const mockRawCourses = [
        {
          _id: 'c1',
          translations: { en: { title: 'Test Course', description: 'Desc', level: 'Beginner' } },
          price: 100,
          currency: 'USD',
          active: true,
          featured: false,
          order: 1
        }
      ];

      // We spy on the REAL 'find' method to intercept it
      const mockFindChain = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockRawCourses)
      };

      jest.spyOn(Course, 'find').mockReturnValue(mockFindChain);
      jest.spyOn(Course, 'countDocuments').mockResolvedValue(1);

      const result = await Course.getDashboardCoursesOptimized({ lang: 'en' });

      // Assertions
      expect(result.courses[0].title).toBe('Test Course');
      expect(result.courses[0].translations).toBeUndefined(); // Should be flattened/removed
      expect(result.total).toBe(1);
    });
  });
});