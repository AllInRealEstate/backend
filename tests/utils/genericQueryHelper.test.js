const GenericQueryHelper = require('../../utils/genericQueryHelper');

describe('Utility: GenericQueryHelper', () => {
  
  // --- 1. Filter Tests ---
  describe('filter()', () => {
    test('should exclude reserved fields (page, sort, limit, etc.)', () => {
      const query = { 
        status: 'active', 
        page: 2, 
        sort: 'price', 
        limit: 10, 
        fields: 'name', 
        search: 'apple' 
      };

      const result = GenericQueryHelper.filter(query);

      expect(result).toEqual({ status: 'active' });
      expect(result.page).toBeUndefined();
      expect(result.sort).toBeUndefined();
    });

    test('should convert operators (gte, gt, lte, lt) to MongoDB syntax ($gte)', () => {
      const query = { 
        price: { gte: '1000', lte: '5000' },
        rating: { gt: '4' }
      };

      const result = GenericQueryHelper.filter(query);

      expect(result).toEqual({
        price: { $gte: '1000', $lte: '5000' },
        rating: { $gt: '4' }
      });
    });
  });

  // --- 2. Sort Tests ---
  describe('sort()', () => {
    test('should format sort string with spaces', () => {
      // Input: ?sort=price,duration
      const result = GenericQueryHelper.sort('price,duration');
      expect(result).toBe('price duration');
    });

    test('should return default sort (-createdAt) if no param provided', () => {
      const result = GenericQueryHelper.sort(undefined);
      expect(result).toBe('-createdAt');
    });

    test('should allow custom default sort', () => {
      const result = GenericQueryHelper.sort(undefined, '-updatedAt');
      expect(result).toBe('-updatedAt');
    });
  });

  // --- 3. Limit Fields Tests ---
  describe('limitFields()', () => {
    test('should format fields string with spaces', () => {
      // Input: ?fields=name,email,price
      const result = GenericQueryHelper.limitFields('name,email,price');
      expect(result).toBe('name email price');
    });

    test('should return default exclusion (-__v) if no param provided', () => {
      const result = GenericQueryHelper.limitFields(undefined);
      expect(result).toBe('-__v');
    });
  });

  // --- 4. Pagination Tests ---
  describe('paginate()', () => {
    test('should return default pagination (page 1, limit 10)', () => {
      const result = GenericQueryHelper.paginate(undefined, undefined);
      
      expect(result).toEqual({
        page: 1,
        limit: 10,
        skip: 0
      });
    });

    test('should calculate skip correctly for page 2', () => {
      // Page 2, Limit 10 -> Should skip first 10 items
      const result = GenericQueryHelper.paginate(2, 10);
      
      expect(result).toEqual({
        page: 2,
        limit: 10,
        skip: 10
      });
    });

    test('should handle string inputs from query params', () => {
      const result = GenericQueryHelper.paginate('3', '50');
      
      expect(result).toEqual({
        page: 3,
        limit: 50,
        skip: 100 // (3-1) * 50 = 100
      });
    });
  });

});