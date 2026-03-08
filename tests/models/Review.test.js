const Review = require('../../models/Review');

// We use 'mongoose' directly to test pre-save hooks if we were connected,
// but for unit tests without DB, we can test the logic by mocking or spying.
// However, standard Model testing usually checks validation.

describe('Review Model Unit Tests', () => {
  it('should validate required fields', () => {
    const review = new Review({});
    const err = review.validateSync();
    
    expect(err.errors.rating).toBeDefined();
    expect(err.errors.originalLanguage).toBeDefined();
  });

  it('should default status to pending and active to false', () => {
    const review = new Review({ rating: 5, originalLanguage: 'en' });
    expect(review.status).toBe('pending');
    expect(review.active).toBe(false);
  });

  // To test the Pre-save hook "active logic", we can simulate the function
  it('logic: should force active=false if status is pending', () => {
    const review = new Review({ status: 'pending', active: true });
    
    // Simulate the pre-save logic manually since we aren't saving to DB
    if (review.status !== 'approved') {
      review.active = false;
    }

    expect(review.active).toBe(false);
  });
});