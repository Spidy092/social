const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const requiredConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
};

cloudinary.config(requiredConfig);

function assertCloudinaryConfig() {
  const missing = Object.entries(requiredConfig)
    .filter(([, value]) => !value || value.startsWith('your_'))
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Cloudinary is not configured. Missing: ${missing.join(', ')}`);
  }
}

function normalizeCloudinaryError(err) {
  const details = err.error?.message || err.message || 'Cloudinary upload failed';
  if (err.http_code === 401 || err.http_code === 403) {
    return new Error('Cloudinary rejected the upload. Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the server.');
  }
  return new Error(details);
}

const uploadFile = async (filePath, options = {}) => {
  try {
    assertCloudinaryConfig();
    const defaultOptions = {
      resource_type: 'auto',
      folder: 'social-poster',
    };
    
    const result = await cloudinary.uploader.upload(filePath, { ...defaultOptions, ...options });
    
    return {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type, // 'image' or 'video'
    };
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    throw normalizeCloudinaryError(err);
  }
};

const deleteFile = async (publicId, resourceType = 'image') => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error('Cloudinary delete error:', err);
    throw err;
  }
};

module.exports = { uploadFile, deleteFile };
