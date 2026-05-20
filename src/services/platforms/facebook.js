const axios = require('axios');

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

async function getPageInfo(connection) {
  if (connection.platform_user_id && connection.access_token) {
    return { pageId: connection.platform_user_id, pageToken: connection.access_token };
  }

  const { data } = await axios.get(`${GRAPH_BASE}/me/accounts`, {
    params: { access_token: connection.access_token },
  });
  if (!data.data || data.data.length === 0) {
    throw new Error('No Facebook Pages found.');
  }
  const page = data.data[0];
  return { pageId: page.id, pageToken: page.access_token };
}

/**
 * Post content to Facebook (single or multi-photo)
 * @param {object} connection
 * @param {object} postData - { mediaUrl, mediaType, caption, mediaUrls? }
 */
async function postContent(connection, { mediaUrl, mediaType, caption, mediaUrls }) {
  const { pageId, pageToken } = await getPageInfo(connection);
  const urls = mediaUrls && mediaUrls.length > 1 ? mediaUrls : null;

  // Single media
  if (!urls) {
    let result;
    if (mediaType === 'video') {
      const { data } = await axios.post(`${GRAPH_BASE}/${pageId}/videos`, {
        file_url: mediaUrl, description: caption, access_token: pageToken,
      });
      result = data;
    } else {
      const { data } = await axios.post(`${GRAPH_BASE}/${pageId}/photos`, {
        url: mediaUrl, caption, access_token: pageToken,
      });
      result = data;
    }
    console.log(`[facebook] Published: ${result.id || result.post_id}`);
    return { platformPostId: result.id || result.post_id };
  }

  const hasImages = urls.some((item) => item.media_type === 'image');
  const hasVideos = urls.some((item) => item.media_type === 'video');
  if (hasImages && hasVideos) {
    throw new Error('Facebook carousel publishing supports images only. Split mixed image/video posts before publishing to Facebook.');
  }
  if (hasVideos) {
    throw new Error('Facebook multi-video publishing is not supported. Publish one video at a time.');
  }

  // Multi-photo: upload each as unpublished, then create feed post with attached_media
  const photoIds = [];
  for (const item of urls) {
    const { data } = await axios.post(`${GRAPH_BASE}/${pageId}/photos`, {
      url: item.url, published: false, access_token: pageToken,
    });
    photoIds.push(data.id);
  }

  const attachedMedia = photoIds.reduce((acc, id, i) => {
    acc[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
    return acc;
  }, {});

  const { data } = await axios.post(`${GRAPH_BASE}/${pageId}/feed`, {
    message: caption,
    ...attachedMedia,
    access_token: pageToken,
  });

  console.log(`[facebook] Published multi-photo: ${data.id}`);
  return { platformPostId: data.id };
}

async function fetchAnalytics(connection, platformPostId) {
  const { data } = await axios.get(`${GRAPH_BASE}/${platformPostId}`, {
    params: { fields: 'likes.summary(true),comments.summary(true),shares', access_token: connection.access_token },
  });
  return {
    likes: data.likes?.summary?.total_count || 0,
    comments: data.comments?.summary?.total_count || 0,
    shares: data.shares?.count || 0,
    views: 0, reach: 0,
  };
}

module.exports = { postContent, fetchAnalytics };
