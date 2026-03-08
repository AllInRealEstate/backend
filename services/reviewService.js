const Review = require('../models/Review');
const AppError = require('../utils/AppError');

class ReviewService {

  /**
   * Public: Submit a Review with Precise Detection
   */
  async submitReview(data) {
    const { author, location, rating, text, lang } = data;
    
    // 1. Precise Language Detection (Regex)
    // Checks if the text strictly contains characters from these languages
    const hasHebrew = /[\u0590-\u05FF]/.test(text);
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasEnglish = /[a-zA-Z]/.test(text);

    let detectedLang = lang; // Default to site language if no letters found (e.g. "123")

    if (hasHebrew) {
      detectedLang = 'he';
    } else if (hasArabic) {
      detectedLang = 'ar';
    } else if (hasEnglish) {
      detectedLang = 'en';
    }

    // 2. Validate strict list
    const safeLang = ['en', 'ar', 'he'].includes(detectedLang) ? detectedLang : 'en';

    // 3. Construct the Review Object
    const reviewData = {
      rating: Number(rating),
      originalLanguage: safeLang, 
      status: 'pending',
      translations: {
        en: {}, ar: {}, he: {} 
      }
    };

    // 4. Populate ONLY the detected language slot
    reviewData.translations[safeLang] = {
      author: author || 'Anonymous',
      location: location || '',
      text: text
    };

    return await Review.create(reviewData);
  }

  /**
   * Public: Get Website Reviews (With Smart Fallback)
   */
  async getWebsiteReviews(requestedLang = 'en', limit = 20) {
    const reviews = await Review.find({ active: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Map & Fallback Logic
    return reviews.map(r => {
      // 1. Try to get the requested language
      let content = r.translations[requestedLang];
      let isFallback = false;

      // 2. If text is missing, FALLBACK to the Original Language
      if (!content || !content.text) {
        content = r.translations[r.originalLanguage];
        isFallback = true;
      }

      return {
        id: r._id,
        rating: r.rating,
        author: content?.author || 'Anonymous',
        location: content?.location || '',
        text: content?.text || '',
        // Meta info for frontend (e.g. to show "Translated from Hebrew")
        originalLanguage: r.originalLanguage,
        isFallback: isFallback,
        createdAt: r.createdAt
      };
    });
  }

  /**
   * Admin: Get Dashboard List
   */
  async getAdminReviews(query) {
    return await Review.getDashboardReviews(query);
  }

  /**
   * Admin: Review By ID (for Editing)
   */
  async getReviewById(id) {
    const review = await Review.findById(id).lean();
    if (!review) throw new AppError('Review not found', 404);
    return review;
  }

  /**
   * Admin: Update/Moderate Review
   * Allows editing text/status
   */
  async updateReview(id, updates) {
    const review = await Review.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });
    if (!review) throw new AppError('Review not found', 404);
    return review;
  }

  /**
   * Admin: Status Change (Approve/Reject)
   */
  async updateStatus(id, status) {
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      throw new AppError('Invalid status', 400);
    }
    return await this.updateReview(id, { status });
  }

  /**
   * Admin: Toggle Active State
   * IMPORTANT: Only works for approved reviews
   */
  async toggleActive(id) {
    const review = await Review.findById(id);
    
    if (!review) {
      throw new AppError('Review not found', 404);
    }

    // Security check: Only approved reviews can be toggled
    if (review.status !== 'approved') {
      throw new AppError('Only approved reviews can be toggled active/inactive', 400);
    }

    // Toggle the active state
    review.active = !review.active;
    await review.save();

    return review;
  }

  /**
   * Admin: Hard Delete Review
   * IMPORTANT: This permanently removes the review from database
   * Should only be accessible by superadmins
   */
  async deleteReview(id) {
    const review = await Review.findByIdAndDelete(id);
    
    if (!review) {
      throw new AppError('Review not found', 404);
    }

    return review;
  }
}

module.exports = new ReviewService();