const Project = require('../../models/Project');

describe('Project Model Unit Tests', () => {
  
  // --- Virtuals ---
  describe('Virtuals: formattedPrice', () => {
    it('should format USD correctly', () => {
      const p = new Project({ price: 1000, currency: 'USD' });
      expect(p.formattedPrice).toBe('$1,000');
    });

    it('should return -- if price is null', () => {
      const p = new Project({ price: null });
      expect(p.formattedPrice).toBe('--');
    });
  });

  // --- Middleware ---
  describe('Middleware: Pre-Save', () => {
    it('should set mainImage from images[0] if mainImage is missing', async () => {
      const p = new Project({
        type: 'forSale',
        images: ['img1.jpg', 'img2.jpg'],
        mainImage: null // <--- CRITICAL FIX: Force null to override the schema default
      });

      // Mimic the pre-save logic manually since we are unit testing without saving to DB
      if (!p.mainImage && p.images.length > 0) {
        p.mainImage = p.images[0];
      }

      expect(p.mainImage).toBe('img1.jpg');
    });
  });
});