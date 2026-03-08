const request = require('supertest');
const express = require('express');
const multer = require('multer'); // ✅ Import multer to create real errors
const { projectUpload, handleMulterError } = require('../../middleware/upload');
const AppError = require('../../utils/AppError');

// Create a mock app to test the middleware chain
const app = express();

// Route that uses the upload middleware
app.post('/upload', projectUpload, (req, res) => {
  res.status(200).json({ success: true, files: req.files });
});

// Register the specific Multer error handler
app.use(handleMulterError);

// Register a global fallback handler for AppErrors (like invalid file type)
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({ success: false, error: err.message });
});

describe('Middleware: Upload (Multer)', () => {
  
  test('should accept valid image files (jpg, png)', async () => {
    const buffer = Buffer.from('fake image content');
    
    const res = await request(app)
      .post('/upload')
      .attach('mainImageFile', buffer, 'test.jpg')
      .attach('galleryFiles', buffer, 'test.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('should reject invalid file types (.txt)', async () => {
    const buffer = Buffer.from('text content');
    
    const res = await request(app)
      .post('/upload')
      .attach('mainImageFile', buffer, 'malicious.txt');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid file type');
  });

  test('should reject unsupported image formats (e.g. svg)', async () => {
    const buffer = Buffer.from('svg content');
    
    const res = await request(app)
      .post('/upload')
      .attach('mainImageFile', buffer, 'icon.svg');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unsupported image format');
  });

  test('should enforce max file count', async () => {
    const buffer = Buffer.from('img');
    const req = request(app).post('/upload').attach('mainImageFile', buffer, 'main.jpg');

    // Attach 12 files (Limit is 11 total)
    for (let i = 0; i < 12; i++) {
      req.attach('galleryFiles', buffer, `img${i}.jpg`);
    }

    const res = await req;
    
    expect(res.status).toBe(400);
    // Expect the specific error message from your handleMulterError
    expect(res.body.error).toContain('Too many files'); 
  });

  test('should handle MulterError specifically via handleMulterError wrapper', () => {
    // ✅ FIX: Create a real MulterError instance so 'instanceof' works
    const multerError = new multer.MulterError('LIMIT_FILE_SIZE');

    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    handleMulterError(multerError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('File too large')
    }));
  });
});