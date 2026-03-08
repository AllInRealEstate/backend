const projectService = require('../../services/projectService');
const Project = require('../../models/Project');
const supabaseService = require('../../services/supabaseService');
const { PROJECT_STATUS } = require('../../constants/constants');

jest.mock('../../models/Project');
jest.mock('../../services/supabaseService');

describe('ProjectService Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- 1. CREATE PROJECT ---
  describe('createProject', () => {
    it('should upload images and create project', async () => {
      const mockData = { title: 'Villa' };
      const mockFiles = {
        mainImageFile: [{ originalname: 'main.jpg', buffer: 'data', mimetype: 'image/jpeg' }],
        galleryFiles: [{ originalname: 'g1.jpg', buffer: 'data', mimetype: 'image/jpeg' }]
      };

      // Mock Uploads
      supabaseService.uploadFile
        .mockResolvedValueOnce('url_main.jpg') // First call (Main)
        .mockResolvedValueOnce('url_g1.jpg');  // Second call (Gallery)

      Project.create.mockResolvedValue({ _id: '123', ...mockData });

      const result = await projectService.createProject(mockData, mockFiles);

      expect(supabaseService.uploadFile).toHaveBeenCalledTimes(2);
      expect(Project.create).toHaveBeenCalledWith(expect.objectContaining({
        mainImage: 'url_main.jpg',
        images: ['url_g1.jpg']
      }));
    });

    it('should rollback uploads if DB creation fails', async () => {
      const mockFiles = {
        mainImageFile: [{ originalname: 'main.jpg', buffer: 'data' }]
      };

      supabaseService.uploadFile.mockResolvedValue('url_main.jpg');
      Project.create.mockRejectedValue(new Error('DB Error'));
      // Mock delete for rollback
      supabaseService.deleteFiles.mockResolvedValue(true); 

      await expect(projectService.createProject({}, mockFiles))
        .rejects.toThrow('DB Error');

      expect(supabaseService.deleteFiles).toHaveBeenCalledWith(['url_main.jpg']);
    });
  });

  // --- 2. DELETE PROJECT ---
  describe('deleteProject', () => {
    it('should perform SOFT delete (default)', async () => {
      Project.findByIdAndUpdate.mockResolvedValue(true);

      const result = await projectService.deleteProject('p1', false);

      expect(Project.findByIdAndUpdate).toHaveBeenCalledWith(
        'p1', 
        { status: PROJECT_STATUS.DELETED }
      );
      expect(result.message).toMatch(/marked as deleted/);
    });

    it('should perform HARD delete and remove files', async () => {
      const mockProject = {
        _id: 'p1',
        mainImage: 'supa_main.jpg',
        images: ['supa_1.jpg'],
        deleteOne: jest.fn()
      };

      Project.findById.mockResolvedValue(mockProject);
      supabaseService.deleteFiles.mockResolvedValue(true);

      const result = await projectService.deleteProject('p1', true);

      expect(mockProject.deleteOne).toHaveBeenCalled();
      expect(supabaseService.deleteFiles).toHaveBeenCalledWith(
        expect.arrayContaining(['supa_main.jpg', 'supa_1.jpg'])
      );
      expect(result.message).toMatch(/permanently deleted/);
    });
  });
});