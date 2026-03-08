const Service = require('../../models/Service');
const mongoose = require('mongoose'); // <--- Import mongoose to generate IDs

describe('Service Model Unit Tests', () => {
  describe('Virtuals: projectCount', () => {
    it('should return length of relatedProjects array', () => {
      // 1. Generate real valid ObjectIds
      const id1 = new mongoose.Types.ObjectId();
      const id2 = new mongoose.Types.ObjectId();
      const id3 = new mongoose.Types.ObjectId();

      // 2. Pass them to the model
      const service = new Service({
        relatedProjects: [id1, id2, id3]
      });

      // 3. Now the length should be 3
      expect(service.projectCount).toBe(3);
    });

    it('should return 0 if relatedProjects is undefined', () => {
      const service = new Service({});
      expect(service.projectCount).toBe(0);
    });
  });
});