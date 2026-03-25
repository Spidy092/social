const axios = require('axios');

const UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';

/**
 * Post content to YouTube
 * @param {object} connection - DB row from platform_connections
 * @param {object} postData - { mediaUrl, mediaType, caption }
 * @returns {{ platformPostId: string }}
 */
async function postContent(connection, { mediaUrl, mediaType, caption }) {
  // YouTube does NOT support image posts
  if (mediaType === 'image') {
    throw new Error('YouTube only supports video posts. Please upload a video file.');
  }

  const accessToken = connection.access_token;

  // Step 1: Initiate resumable upload
  const initResponse = await axios.post(
    `${UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
    {
      snippet: {
        title: caption.slice(0, 100),
        description: caption,
        categoryId: '22', // People & Blogs
      },
      status: {
        privacyStatus: 'public',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
      },
    }
  );

  const resumableUploadUrl = initResponse.headers.location;

  if (!resumableUploadUrl) {
    throw new Error('YouTube did not return a resumable upload URL.');
  }

  // Step 2: Download video from Cloudinary and upload to YouTube
  const videoResponse = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
  });

  const { data: uploadResult } = await axios.put(resumableUploadUrl, videoResponse.data, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': videoResponse.data.length,
    },
  });

  const videoId = uploadResult.id;
  console.log(`[youtube] Published: ${videoId}`);
  return { platformPostId: videoId };
}

module.exports = { postContent };
