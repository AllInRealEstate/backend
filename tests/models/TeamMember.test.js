const TeamMember = require('../../models/TeamMember');

describe('TeamMember Model Unit Tests', () => {

  describe('getByLanguage (Instance Method)', () => {
    it('should return correct language fields', () => {
      const member = new TeamMember({
        translations: {
          en: { name: 'John', title: 'Agent', bio: 'Bio' },
          he: { name: 'Yoni', title: 'Sochen', bio: 'BioHE' }
        },
        email: 'test@test.com'
      });

      const enData = member.getByLanguage('en');
      expect(enData.name).toBe('John');

      const heData = member.getByLanguage('he');
      expect(heData.name).toBe('Yoni');
    });

    it('should fallback to english if invalid lang provided', () => {
      const member = new TeamMember({
        translations: { en: { name: 'John', title: 'Agent', bio: 'Bio' } },
        email: 'test@test.com'
      });

      const data = member.getByLanguage('fr'); // Unsupported lang
      expect(data.name).toBe('John'); // Should return English
    });
  });

  describe('getWebsiteMembersOptimized (Static)', () => {
    it('should use fallback if specific language field is missing', async () => {
      const mockMembers = [{
        _id: 'tm1',
        translations: { 
          en: { name: 'John EN', title: 'Title EN' },
          he: { name: 'John HE' } // 'title' missing in HE
        },
        image: 'img.jpg',
        role: 'Agent'
      }];

      const mockFindChain = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockMembers)
      };

      const realMethod = jest.requireActual('../../models/TeamMember').schema.statics.getWebsiteMembersOptimized;
      TeamMember.getWebsiteMembersOptimized = realMethod.bind(TeamMember);
      TeamMember.find = jest.fn().mockReturnValue(mockFindChain);

      // Request Hebrew
      const result = await TeamMember.getWebsiteMembersOptimized('he');

      // Logic check: Uses Hebrew Name, but falls back to English Title
      expect(result[0].name).toBe('John HE');
      expect(result[0].title).toBe('Title EN'); 
    });
  });
});