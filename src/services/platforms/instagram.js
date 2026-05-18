const axios = require('axios');

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';
const POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 10;

async function pollContainerStatus(containerId, accessToken) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const { data } = await axios.get(`${GRAPH_BASE}/${containerId}`, {
      params: { fields: 'status_code', access_token: accessToken },
    });
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') {
      throw new Error(`Instagram container creation failed: ${data.status_code}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
  throw new Error('Instagram container polling timed out');
}

/**
 * Post content to Instagram (single or carousel)
 * @param {object} connection
 * @param {object} postData - { mediaUrl, mediaType, caption, mediaUrls? }
 */
async function postContent(connection, { mediaUrl, mediaType, caption, mediaUrls }) {
  const accessToken = connection.access_token;
  const igUserId = connection.platform_user_id;
  const urls = mediaUrls && mediaUrls.length > 1 ? mediaUrls : [{ url: mediaUrl, media_type: mediaType }];

  // Single media post
  if (urls.length === 1) {
    const item = urls[0];
    const containerBody = { caption, access_token: accessToken };
    if (item.media_type === 'video') {
      containerBody.media_type = 'REELS';
      containerBody.video_url = item.url;
    } else {
      containerBody.image_url = item.url;
    }

    const { data: containerData } = await axios.post(`${GRAPH_BASE}/${igUserId}/media`, containerBody);
    await pollContainerStatus(containerData.id, accessToken);

    const { data: publishData } = await axios.post(`${GRAPH_BASE}/${igUserId}/media_publish`, {
      creation_id: containerData.id, access_token: accessToken,
    });
    console.log(`[instagram] Published: ${publishData.id}`);
    return { platformPostId: publishData.id };
  }

  // Carousel post
  const childIds = [];
  for (const item of urls) {
    const body = { is_carousel_item: true, access_token: accessToken };
    if (item.media_type === 'video') {
      body.media_type = 'VIDEO';
      body.video_url = item.url;
    } else {
      body.image_url = item.url;
    }
    const { data } = await axios.post(`${GRAPH_BASE}/${igUserId}/media`, body);
    await pollContainerStatus(data.id, accessToken);
    childIds.push(data.id);
  }

  // Create carousel container
  const { data: carouselData } = await axios.post(`${GRAPH_BASE}/${igUserId}/media`, {
    media_type: 'CAROUSEL',
    caption,
    children: childIds.join(','),
    access_token: accessToken,
  });
  await pollContainerStatus(carouselData.id, accessToken);

  const { data: publishData } = await axios.post(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    creation_id: carouselData.id, access_token: accessToken,
  });
  console.log(`[instagram] Published carousel: ${publishData.id}`);
  return { platformPostId: publishData.id };
}

async function fetchAnalytics(connection, platformPostId) {
  const [{ data: media }, insights] = await Promise.all([
    axios.get(`${GRAPH_BASE}/${platformPostId}`, {
      params: { fields: 'like_count,comments_count', access_token: connection.access_token },
    }),
    axios.get(`${GRAPH_BASE}/${platformPostId}/insights`, {
      params: { metric: 'reach,views', access_token: connection.access_token },
    }).then((r) => r.data).catch(() => ({ data: [] })),
  ]);
  const metrics = Object.fromEntries((insights.data || []).map((i) => [i.name, i.values?.[0]?.value || 0]));
  return { likes: media.like_count || 0, comments: media.comments_count || 0, shares: 0, views: metrics.views || 0, reach: metrics.reach || 0 };
}

module.exports = { postContent, fetchAnalytics };
