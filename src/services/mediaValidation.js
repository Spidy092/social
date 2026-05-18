// Platform-specific media constraints
const PLATFORM_LIMITS = {
  instagram: {
    maxImages: 10,
    maxVideoSize: 100 * 1024 * 1024, // 100MB
    maxImageSize: 8 * 1024 * 1024, // 8MB
    allowedTypes: ['image', 'video'],
    supportsCarousel: true,
  },
  facebook: {
    maxImages: 10,
    maxVideoSize: 1024 * 1024 * 1024, // 1GB
    maxImageSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image', 'video'],
    supportsCarousel: true,
  },
  linkedin: {
    maxImages: 9,
    maxVideoSize: 200 * 1024 * 1024, // 200MB
    maxImageSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image', 'video'],
    supportsCarousel: true,
  },
  youtube: {
    maxImages: 0,
    maxVideoSize: 256 * 1024 * 1024, // 256GB but we cap at 256MB for upload
    maxImageSize: 0,
    allowedTypes: ['video'],
    supportsCarousel: false,
  },
  threads: {
    maxImages: 20,
    maxVideoSize: 1024 * 1024 * 1024, // 1GB
    maxImageSize: 8 * 1024 * 1024, // 8MB
    allowedTypes: ['image', 'video'],
    supportsCarousel: true,
  },
};

/**
 * Validate media files against selected platforms
 * @param {Array} mediaFiles - [{media_type, file_size}]
 * @param {Array} platforms - ['instagram', 'facebook', ...]
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateMedia(mediaFiles, platforms) {
  const errors = [];

  if (!mediaFiles || mediaFiles.length === 0) {
    errors.push('At least one media file is required');
    return { valid: false, errors };
  }

  for (const platform of platforms) {
    const limits = PLATFORM_LIMITS[platform];
    if (!limits) continue;

    const images = mediaFiles.filter(f => f.media_type === 'image');
    const videos = mediaFiles.filter(f => f.media_type === 'video');

    // Check allowed types
    if (videos.length > 0 && !limits.allowedTypes.includes('video')) {
      errors.push(`${platform}: does not support video`);
    }
    if (images.length > 0 && !limits.allowedTypes.includes('image')) {
      errors.push(`${platform}: does not support images`);
    }

    // Check carousel limits
    if (images.length > 1 && !limits.supportsCarousel) {
      errors.push(`${platform}: does not support multiple images`);
    }
    if (images.length > limits.maxImages) {
      errors.push(`${platform}: max ${limits.maxImages} images allowed`);
    }

    // Can't mix video and images in carousel (IG/FB rule)
    if (mediaFiles.length > 1 && videos.length > 0 && images.length > 0) {
      errors.push(`${platform}: cannot mix images and videos in a carousel`);
    }

    // Size checks
    for (const img of images) {
      if (img.file_size && img.file_size > limits.maxImageSize) {
        errors.push(`${platform}: image exceeds ${Math.round(limits.maxImageSize / 1024 / 1024)}MB limit`);
        break;
      }
    }
    for (const vid of videos) {
      if (vid.file_size && vid.file_size > limits.maxVideoSize) {
        errors.push(`${platform}: video exceeds ${Math.round(limits.maxVideoSize / 1024 / 1024)}MB limit`);
        break;
      }
    }

    // YouTube requires exactly 1 video
    if (platform === 'youtube' && videos.length !== 1) {
      errors.push('YouTube requires exactly 1 video');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { PLATFORM_LIMITS, validateMedia };
