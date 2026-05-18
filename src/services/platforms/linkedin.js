const axios = require('axios');

const API_BASE = 'https://api.linkedin.com';

async function registerUpload(personUrn, accessToken) {
  const { data } = await axios.post(
    `${API_BASE}/v2/assets?action=registerUpload`,
    {
      registerUploadRequest: {
        owner: personUrn,
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        serviceRelationships: [{ identifier: 'urn:li:userGeneratedContent', relationshipType: 'OWNER' }],
      },
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const uploadUrl = data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  return { uploadUrl, asset: data.value.asset };
}

async function uploadImage(uploadUrl, mediaUrl, accessToken) {
  const imageResponse = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
  await axios.put(uploadUrl, imageResponse.data, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/jpeg' },
  });
}

/**
 * Post content to LinkedIn (single or multi-image)
 * @param {object} connection
 * @param {object} postData - { mediaUrl, mediaType, caption, mediaUrls? }
 */
async function postContent(connection, { mediaUrl, mediaType, caption, mediaUrls }) {
  const accessToken = connection.access_token;
  const personUrn = connection.platform_user_id
    ? `urn:li:person:${connection.platform_user_id}`
    : (await axios.get(`${API_BASE}/v2/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } })).data.sub;

  if (mediaType === 'video' && (!mediaUrls || mediaUrls.length <= 1)) {
    // Video as text+link (LinkedIn video upload is complex)
    const { data } = await axios.post(`${API_BASE}/v2/ugcPosts`, {
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: `${caption}\n\n${mediaUrl}` }, shareMediaCategory: 'NONE' } },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }, { headers: { Authorization: `Bearer ${accessToken}` } });
    console.log(`[linkedin] Published (text+link): ${data.id}`);
    return { platformPostId: data.id };
  }

  // Determine images to upload
  const images = mediaUrls && mediaUrls.length > 0
    ? mediaUrls.filter(m => m.media_type === 'image')
    : [{ url: mediaUrl, media_type: mediaType }];

  // Upload all images and collect asset URNs
  const mediaEntries = [];
  for (const img of images) {
    const { uploadUrl, asset } = await registerUpload(personUrn, accessToken);
    await uploadImage(uploadUrl, img.url, accessToken);
    mediaEntries.push({ status: 'READY', originalUrl: img.url, media: asset });
  }

  const { data } = await axios.post(`${API_BASE}/v2/ugcPosts`, {
    author: personUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: caption },
        shareMediaCategory: 'IMAGE',
        media: mediaEntries,
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }, { headers: { Authorization: `Bearer ${accessToken}` } });

  console.log(`[linkedin] Published: ${data.id}`);
  return { platformPostId: data.id };
}

async function fetchAnalytics(connection, platformPostId) {
  const encodedUrn = encodeURIComponent(platformPostId);
  const { data } = await axios.get(`${API_BASE}/rest/socialActions/${encodedUrn}`, {
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
      'Linkedin-Version': process.env.LINKEDIN_VERSION || '202605',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });
  return {
    likes: data.likesSummary?.aggregatedTotalLikes || data.likesSummary?.totalLikes || 0,
    comments: data.commentsSummary?.aggregatedTotalComments || data.commentsSummary?.totalFirstLevelComments || 0,
    shares: 0, views: 0, reach: 0,
  };
}

module.exports = { postContent, fetchAnalytics };
