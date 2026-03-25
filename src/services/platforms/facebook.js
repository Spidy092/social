const axios = require('axios');

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

/**
 * Get Page ID and Page Access Token
 */
async function getPageInfo(accessToken) {
  const { data } = await axios.get(`${GRAPH_BASE}/me/accounts`, {
    params: { access_token: accessToken },
  });

  if (!data.data || data.data.length === 0) {
    throw new Error('No Facebook Pages found. Ensure the user has a connected Page.');
  }

  const page = data.data[0];
  return { pageId: page.id, pageToken: page.access_token };
}

/**
 * Post content to a Facebook Page
 * @param {object} connection - DB row from platform_connections
 * @param {object} postData - { mediaUrl, mediaType, caption }
 * @returns {{ platformPostId: string }}
 */
async function postContent(connection, { mediaUrl, mediaType, caption }) {
  const accessToken = connection.access_token;

  // Step 1: Get Page ID and Page-level token
  const { pageId, pageToken } = await getPageInfo(accessToken);

  let result;

  if (mediaType === 'video') {
    // Post video to Page
    const { data } = await axios.post(`${GRAPH_BASE}/${pageId}/videos`, {
      file_url: mediaUrl,
      description: caption,
      access_token: pageToken,
    });
    result = data;
  } else {
    // Post image to Page
    const { data } = await axios.post(`${GRAPH_BASE}/${pageId}/photos`, {
      url: mediaUrl,
      caption,
      access_token: pageToken,
    });
    result = data;
  }

  const platformPostId = result.id || result.post_id;
  console.log(`[facebook] Published: ${platformPostId}`);
  return { platformPostId };
}

module.exports = { postContent };
