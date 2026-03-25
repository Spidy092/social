const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadFile = async (filePath, options = {}) => {
  try {
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
    throw err;
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
