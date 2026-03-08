const mongoose = require('mongoose');
const projectService = require('../../services/projectService');
const serviceService = require('../../services/serviceService');
const Project = require('../../models/Project');
const supabaseService = require('../../services/supabaseService');
const sharp = require('sharp');
const { PROJECT_STATUS, PROJECT_TYPES } = require('../../constants/constants');

// Mock Supabase Service
jest.mock('../../services/supabaseService');

describe('Project & Image Handling Integration (Supabase)', () => {
  // Real 1x1 pixel transparent PNG buffer for Sharp
  const realImageBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  const mockFile = (name) => ({
    originalname: name,
    buffer: realImageBuffer,
    mimetype: 'image/png'
  });

  const validProjectData = {
    translations: {
      en: { title: 'Luxury Villa', location: 'Tel Aviv' },
      he: { title: 'וילה יוקרתית', location: 'תל אביב' },
      ar: { title: 'فيला فاخرة', location: 'تل ابيب' }
    },
    type: PROJECT_TYPES.FOR_SALE,
    status: PROJECT_STATUS.ACTIVE,
    price: 5000000
  };



  beforeEach(async () => {
    await Project.deleteMany({});
    jest.clearAllMocks();
    
    // ✅ CRITICAL FIX: Ensure all mocked methods return a Promise to allow .catch() chaining
    supabaseService.uploadFile.mockImplementation((buf, name) => 
      Promise.resolve(`https://supabase.com/storage/v1/object/public/media/${name}`)
    );
    
    // Mock deleteFile and deleteFiles to return a resolved promise
    supabaseService.deleteFile.mockResolvedValue(undefined);
    supabaseService.deleteFiles.mockResolvedValue(undefined);
  });

  test('Project Creation with Media: Should upload all files and save URLs', async () => {
    const files = {
      mainImageFile: [mockFile('main.png')],
      galleryFiles: [mockFile('gal1.png'), mockFile('gal2.png')]
    };

    const project = await projectService.createProject(validProjectData, files);

    expect(supabaseService.uploadFile).toHaveBeenCalledTimes(3);
    expect(project.mainImage).toContain('main');
    expect(project.images).toHaveLength(2);
  });

  test('Supabase Rollback: Should delete uploaded images if DB save fails', async () => {
    const files = {
      mainImageFile: [mockFile('fail-test.png')]
    };

    const invalidData = JSON.parse(JSON.stringify(validProjectData));
    delete invalidData.translations.ar; // Triggers Mongoose ValidationError

    await expect(projectService.createProject(invalidData, files))
      .rejects.toThrow();

    expect(supabaseService.deleteFiles).toHaveBeenCalledWith([
      expect.stringContaining('fail-test')
    ]);
  });

  test('Project Deletion Cleanup: Should trigger storage purge on permanent delete', async () => {
    const project = await Project.create({
      ...validProjectData,
      mainImage: 'https://supabase.com/media/main.png',
      images: ['https://supabase.com/media/gal1.png']
    });

    await projectService.deleteProject(project._id, true);

    // Verify deleteFiles was called with the correct array
    expect(supabaseService.deleteFiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        'https://supabase.com/media/main.png',
        'https://supabase.com/media/gal1.png'
      ])
    );
  });

  test('Thumbnail Generation: Should resize image via Sharp before upload', async () => {
    const sharpSpy = jest.spyOn(sharp.prototype, 'resize');
    
    const file = mockFile('icon.png');
    await serviceService.processAndUploadIcon(file);

    expect(sharpSpy).toHaveBeenCalledWith(
      800, 
      800, 
      expect.objectContaining({ fit: 'inside' })
    );
    
    sharpSpy.mockRestore();
  });
});