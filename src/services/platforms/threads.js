const axios = require('axios');

const THREADS_BASE = 'https://graph.threads.net/v1.0';
const POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 12;

async function pollContainerStatus(containerId, accessToken) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const { data } = await axios.get(`${THREADS_BASE}/${containerId}`, {
      params: { fields: 'status', access_token: accessToken },
    });
    if (data.status === 'FINISHED') return;
    if (data.status === 'ERROR') throw new Error('Threads media container failed');
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  throw new Error('Threads container polling timed out');
}

/**
 * Post content to Threads (single or carousel)
 * @param {object} connection
 * @param {object} postData - { mediaUrl, mediaType, caption, mediaUrls? }
 */
async function postContent(connection, { mediaUrl, mediaType, caption, mediaUrls }) {
  const accessToken = connection.access_token;
  const userId = connection.platform_user_id;
  const urls = mediaUrls && mediaUrls.length > 1 ? mediaUrls : null;

  // Single post
  if (!urls) {
    const params = { text: caption, access_token: accessToken };
    if (mediaType === 'image') {
      params.media_type = 'IMAGE';
      params.image_url = mediaUrl;
    } else if (mediaType === 'video') {
      params.media_type = 'VIDEO';
      params.video_url = mediaUrl;
    } else {
      params.media_type = 'TEXT';
    }

    const { data: container } = await axios.post(`${THREADS_BASE}/${userId}/threads`, params);
    await pollContainerStatus(container.id, accessToken);

    const { data: published } = await axios.post(`${THREADS_BASE}/${userId}/threads_publish`, {
      creation_id: container.id, access_token: accessToken,
    });
    console.log(`[threads] Published: ${published.id}`);
    return { platformPostId: published.id };
  }

  // Carousel (2-20 items)
  const childIds = [];
  for (const item of urls) {
    const params = { is_carousel_item: true, access_token: accessToken };
    if (item.media_type === 'video') {
      params.media_type = 'VIDEO';
      params.video_url = item.url;
    } else {
      params.media_type = 'IMAGE';
      params.image_url = item.url;
    }
    const { data } = await axios.post(`${THREADS_BASE}/${userId}/threads`, params);
    await pollContainerStatus(data.id, accessToken);
    childIds.push(data.id);
  }

  const { data: carouselContainer } = await axios.post(`${THREADS_BASE}/${userId}/threads`, {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    text: caption,
    access_token: accessToken,
  });
  await pollContainerStatus(carouselContainer.id, accessToken);

  const { data: published } = await axios.post(`${THREADS_BASE}/${userId}/threads_publish`, {
    creation_id: carouselContainer.id, access_token: accessToken,
  });
  console.log(`[threads] Published carousel: ${published.id}`);
  return { platformPostId: published.id };
}

async function fetchAnalytics(connection, platformPostId) {
  const { data } = await axios.get(`${THREADS_BASE}/${platformPostId}/insights`, {
    params: {
      metric: 'views,likes,replies,reposts,quotes',
      access_token: connection.access_token,
    },
  });

  const metrics = (data.data || []).reduce((acc, item) => {
    const value = item.values?.[0]?.value ?? item.total_value?.value ?? 0;
    acc[item.name] = Number(value || 0);
    return acc;
  }, {});

  return {
    likes: metrics.likes || 0,
    comments: metrics.replies || 0,
    shares: (metrics.reposts || 0) + (metrics.quotes || 0),
    views: metrics.views || 0,
    reach: 0,
  };
}

module.exports = { postContent, fetchAnalytics };
