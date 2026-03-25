const axios = require('axios');

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLL_ATTEMPTS = 10;

/**
 * Get Instagram user ID from access token
 */
async function getIgUserId(accessToken) {
  const { data } = await axios.get(`${GRAPH_BASE}/me`, {
    params: { fields: 'id,username', access_token: accessToken },
  });
  return data.id;
}

/**
 * Poll container status until FINISHED
 */
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
  throw new Error('Instagram container polling timed out after 10 attempts');
}

/**
 * Post content to Instagram
 * @param {object} connection - DB row from platform_connections
 * @param {object} postData - { mediaUrl, mediaType, caption }
 * @returns {{ platformPostId: string }}
 */
async function postContent(connection, { mediaUrl, mediaType, caption }) {
  const accessToken = connection.access_token;
  const igUserId = connection.platform_user_id || await getIgUserId(accessToken);

  // Step 1: Create media container
  const containerBody = { caption, access_token: accessToken };

  if (mediaType === 'video') {
    containerBody.media_type = 'REELS';
    containerBody.video_url = mediaUrl;
  } else {
    containerBody.image_url = mediaUrl;
  }

  const { data: containerData } = await axios.post(
    `${GRAPH_BASE}/${igUserId}/media`,
    containerBody
  );
  const containerId = containerData.id;

  // Step 2: Poll container status — NEVER skip
  await pollContainerStatus(containerId, accessToken);

  // Step 3: Publish
  const { data: publishData } = await axios.post(
    `${GRAPH_BASE}/${igUserId}/media_publish`,
    { creation_id: containerId, access_token: accessToken }
  );

  console.log(`[instagram] Published: ${publishData.id}`);
  return { platformPostId: publishData.id };
}

module.exports = { postContent };
