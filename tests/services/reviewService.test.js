const reviewService = require('../../services/reviewService');
const Review = require('../../models/Review');
const AppError = require('../../utils/AppError');

// Mock Model
jest.mock('../../models/Review');

describe('ReviewService Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- 1. SUBMIT REVIEW (Language Detection) ---
  describe('submitReview', () => {
    it('should detect Hebrew text and save to "he" field', async () => {
      const input = {
        rating: 5,
        text: 'שלום עולם', // Hebrew
        author: 'Yossi'
      };

      Review.create.mockImplementation((data) => data);

      const result = await reviewService.submitReview(input);

      expect(result.originalLanguage).toBe('he');
      expect(result.translations.he.text).toBe('שלום עולם');
      expect(result.translations.en.text).toBeUndefined();
    });

    it('should detect Arabic text and save to "ar" field', async () => {
      const input = {
        rating: 5,
        // CRITICAL FIX: Use actual Arabic characters "Marhaba" (مرحبا)
        text: 'مرحبا بالعالم', 
        author: 'Ahmed'
      };

      Review.create.mockImplementation((data) => data);

      const result = await reviewService.submitReview(input);

      expect(result.originalLanguage).toBe('ar');
      expect(result.translations.ar.text).toContain('مرحبا');
    });

    it('should default to English if no specific characters found', async () => {
      const input = {
        rating: 5,
        text: '12345 !!!', // Neutral text
        author: 'Anon'
      };

      Review.create.mockImplementation((data) => data);

      const result = await reviewService.submitReview(input);

      expect(result.originalLanguage).toBe('en');
    });
  });

  // --- 2. GET WEBSITE REVIEWS (Fallback Logic) ---
  describe('getWebsiteReviews', () => {
    it('should fall back to original language if requested lang is missing', async () => {
      const mockReviews = [
        {
          _id: 'r1',
          rating: 5,
          originalLanguage: 'he',
          translations: {
            he: { text: 'Hebrew Text', author: 'HeAuthor' },
            en: { text: '' } // Empty English
          },
          createdAt: new Date()
        }
      ];

      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockReviews)
      };
      Review.find.mockReturnValue(mockQuery);

      // Request English
      const result = await reviewService.getWebsiteReviews('en');

      // Should get Hebrew content because English was empty
      expect(result[0].text).toBe('Hebrew Text');
      expect(result[0].isFallback).toBe(true);
      expect(result[0].originalLanguage).toBe('he');
    });
  });

  // --- 3. TOGGLE ACTIVE ---
  describe('toggleActive', () => {
    it('should throw error if review is not approved', async () => {
      const mockReview = {
        status: 'pending',
        active: false,
        save: jest.fn()
      };
      
      Review.findById.mockResolvedValue(mockReview);

      await expect(reviewService.toggleActive('r1'))
        .rejects.toThrow(/Only approved reviews/);
    });

    it('should toggle active if approved', async () => {
      const mockReview = {
        status: 'approved',
        active: false,
        save: jest.fn()
      };
      
      Review.findById.mockResolvedValue(mockReview);

      await reviewService.toggleActive('r1');

      expect(mockReview.active).toBe(true);
      expect(mockReview.save).toHaveBeenCalled();
    });
  });
});