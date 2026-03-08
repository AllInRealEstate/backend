const LeadActivity = require('../../models/LeadActivity');

describe('LeadActivity Model Unit Tests', () => {
  it('should be defined', () => {
    expect(LeadActivity).toBeDefined();
  });

  it('should require lead, type, and content', () => {
    const activity = new LeadActivity({});
    
    const error = activity.validateSync();
    
    expect(error.errors.lead).toBeDefined();
    expect(error.errors.type).toBeDefined();
    expect(error.errors.content).toBeDefined();
    expect(error.errors.authorName).toBeDefined();
  });
});