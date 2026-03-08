// backend/services/supabaseService.js
const connectSupabase = require('../config/supabase');
const supabase = connectSupabase(); // Initialize the client
const sharp = require('sharp');


class SupabaseService {

  // ==========================================
  // 🛠️ HELPER FUNCTIONS (Internal Logic)
  // ==========================================

  /**
   * Smart Compression: Reduces size if > 100KB
   */
 // 1. Internal Helper: Compress
  async _compressImage(imageBuffer) {
    try {
      const originalKB = imageBuffer.length / 1024;
      if (originalKB < 100) return imageBuffer;

      return await sharp(imageBuffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 70, mozjpeg: true })
        .toBuffer();
    } catch (error) {
      console.warn('Compression failed, using original:', error.message);
      return imageBuffer;
    }
  }

  // ==========================================
  // 🚀 MAIN PUBLIC FUNCTIONS
  // ==========================================

  /**
   * 1. Upload File (Standard Upload)
   * Compresses and uploads a file buffer to Supabase.
   * @param {Buffer} fileBuffer - The file data
   * @param {string} fileName - Full path (e.g. 'projects/img1.jpg')
   * @param {string} mimeType - e.g. 'image/jpeg'
   */
// 2. Main Upload Function
  async uploadFile(fileBuffer, fileName, mimeType, retries = 3) {
    // ✅ FIX: Read .env dynamically here to ensure it's loaded
    const bucketName = process.env.SUPABASE_BUCKET || 'media'; 

    console.log(`🔍 [Supabase] Uploading to bucket: '${bucketName}'`);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const processedBuffer = await this._compressImage(fileBuffer);

        const { error } = await supabase.storage
          .from(bucketName) // Use the dynamic variable
          .upload(fileName, processedBuffer, {
            contentType: mimeType,
            upsert: true
          });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(fileName);

        return urlData.publicUrl;

      } catch (error) {
        console.error(`❌ Upload attempt ${attempt} failed:`, error.message);
        if (attempt === retries) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }


// 3. Delete Function
  async deleteFile(fileUrl) {
    if (!fileUrl) return;
    const bucketName = process.env.SUPABASE_BUCKET || 'media';
    
    try {
      const path = fileUrl.split(`${bucketName}/`).pop();
      await supabase.storage.from(bucketName).remove([path]);
    } catch (error) {
      console.error('❌ Delete failed:', error.message);
    }
  }
  /**
   * // 4. Batch Delete
   * Takes an array of public URLs and deletes them all at once.
   */
  async deleteFiles(urls) {
    if (!urls || urls.length === 0) return;
    const bucketName = process.env.SUPABASE_BUCKET || 'media';

    try {
      const paths = urls.map(url => {
        const parts = url.split(`${bucketName}/`);
        return parts.length > 1 ? parts[1] : null;
      }).filter(p => p);

      if (paths.length > 0) {
        await supabase.storage.from(bucketName).remove(paths);
      }
    } catch (error) {
      console.error('❌ Batch delete failed:', error.message);
    }
  }
}

module.exports = new SupabaseService();