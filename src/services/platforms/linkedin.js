const axios = require('axios');

const API_BASE = 'https://api.linkedin.com';

/**
 * Get LinkedIn person URN
 */
async function getPersonUrn(accessToken) {
  const { data } = await axios.get(`${API_BASE}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return `urn:li:person:${data.sub}`;
}

/**
 * Register an image upload with LinkedIn
 */
async function registerUpload(personUrn, accessToken) {
  const { data } = await axios.post(
    `${API_BASE}/v2/assets?action=registerUpload`,
    {
      registerUploadRequest: {
        owner: personUrn,
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        serviceRelationships: [
          {
            identifier: 'urn:li:userGeneratedContent',
            relationshipType: 'OWNER',
          },
        ],
      },
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const uploadMech = data.value.uploadMechanism;
  const uploadUrl =
    uploadMech['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset = data.value.asset;

  return { uploadUrl, asset };
}

/**
 * Upload binary image data to LinkedIn's upload URL
 */
async function uploadImage(uploadUrl, mediaUrl, accessToken) {
  // Download the image from Cloudinary first
  const imageResponse = await axios.get(mediaUrl, { responseType: 'arraybuffer' });

  await axios.put(uploadUrl, imageResponse.data, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'image/jpeg',
    },
  });
}

/**
 * Create a UGC post on LinkedIn
 */
async function createUgcPost(personUrn, caption, assetUrn, mediaUrl, accessToken) {
  const { data } = await axios.post(
    `${API_BASE}/v2/ugcPosts`,
    {
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: 'IMAGE',
          media: [
            {
              status: 'READY',
              originalUrl: mediaUrl,
              media: assetUrn,
            },
          ],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  return data.id;
}

/**
 * Post content to LinkedIn
 * @param {object} connection - DB row from platform_connections
 * @param {object} postData - { mediaUrl, mediaType, caption }
 * @returns {{ platformPostId: string }}
 */
async function postContent(connection, { mediaUrl, mediaType, caption }) {
  const accessToken = connection.access_token;
  const personUrn = connection.platform_user_id
    ? `urn:li:person:${connection.platform_user_id}`
    : await getPersonUrn(accessToken);

  if (mediaType === 'video') {
    // LinkedIn video upload is more complex; for now post as text with link
    // Full video upload requires a different flow
    const { data } = await axios.post(
      `${API_BASE}/v2/ugcPosts`,
      {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: `${caption}\n\n${mediaUrl}` },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    console.log(`[linkedin] Published (text+link): ${data.id}`);
    return { platformPostId: data.id };
  }

  // Image flow: register → upload binary → create ugcPost
  const { uploadUrl, asset } = await registerUpload(personUrn, accessToken);
  await uploadImage(uploadUrl, mediaUrl, accessToken);
  const postId = await createUgcPost(personUrn, caption, asset, mediaUrl, accessToken);

  console.log(`[linkedin] Published: ${postId}`);
  return { platformPostId: postId };
}

module.exports = { postContent };
