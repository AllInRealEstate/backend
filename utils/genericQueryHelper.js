/**
 * Generic Query Helper
 * Handles standard Filtering, Sorting, Pagination, and Field Limiting
 * for all Mongoose models.
 */
class GenericQueryHelper {
  
  /**
   * 1. Filtering
   * Handles basic filters (status=active) and operators (price[gte]=100).
   * Removes reserved keywords automatically.
   */
  static filter(queryParams) {
    // A. Create a copy to avoid mutating the original request
    const queryObj = { ...queryParams };
    
    // B. Exclude special control fields
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
    excludedFields.forEach(el => delete queryObj[el]);

    // C. Advanced filtering (gte, gt, lte, lt, in)
    // Example: ?price[gte]=1000 becomes { price: { $gte: 1000 } }
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt|in)\b/g, match => `$${match}`);
    
    return JSON.parse(queryStr);
  }

  /**
   * 2. Sorting
   * defaults to newest first (-createdAt).
   * Usage: ?sort=price,duration -> sort('price duration')
   */
  static sort(sortParam, defaultSort = '-createdAt') {
    if (sortParam) {
      return sortParam.split(',').join(' ');
    }
    return defaultSort;
  }

  /**
   * 3. Field Limiting (Projection)
   * Optimization: Only fetch the fields the client needs.
   * Usage: ?fields=title,price -> select('title price')
   */
  static limitFields(fieldsParam) {
    if (fieldsParam) {
      return fieldsParam.split(',').join(' ');
    }
    return '-__v'; // Default: Exclude Mongoose internal version key
  }

  /**
   * 4. Pagination
   * Standard pagination calculation.
   */
  static paginate(pageParam, limitParam) {
    const page = parseInt(pageParam, 10) || 1;
    const limit = parseInt(limitParam, 10) || 10;
    const skip = (page - 1) * limit;
    
    return { page, limit, skip };
  }
}

module.exports = GenericQueryHelper;