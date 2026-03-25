const { pool } = require('../../db');
const instagram = require('./instagram');
const facebook = require('./facebook');
const linkedin = require('./linkedin');
const youtube = require('./youtube');

const services = { instagram, facebook, linkedin, youtube };

/**
 * Refresh token based on platform
 */
async function refreshToken(platform, refreshTokenValue) {
  // Meta platforms (Instagram & Facebook) use the same endpoint
  if (platform === 'instagram' || platform === 'facebook') {
    const axios = require('axios');
    const { data } = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: refreshTokenValue,
      },
    });
    return {
      access_token: data.access_token,
      expires_at: new Date(Date.now() + (data.expires_in || 5184000) * 1000),
    };
  }

  if (platform === 'linkedin') {
    const axios = require('axios');
    const { data } = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'refresh_token',
        refresh_token: refreshTokenValue,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      },
    });
    return {
      access_token: data.access_token,
      expires_at: new Date(Date.now() + (data.expires_in || 5184000) * 1000),
    };
  }

  if (platform === 'youtube') {
    const axios = require('axios');
    const { data } = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: {
        grant_type: 'refresh_token',
        refresh_token: refreshTokenValue,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
      },
    });
    return {
      access_token: data.access_token,
      expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    };
  }

  throw new Error(`Token refresh not implemented for platform: ${platform}`);
}

/**
 * Call an API function with automatic token refresh on 401
 * Follows the pattern from PLATFORM_APIS.md
 */
async function callWithRefresh(platform, connection, apiFn) {
  try {
    return await apiFn(connection.access_token);
  } catch (err) {
    if (err.response?.status === 401 && connection.refresh_token) {
      console.log(`[${platform}] 401 received — refreshing token...`);
      const newToken = await refreshToken(platform, connection.refresh_token);
      await pool.query(
        'UPDATE platform_connections SET access_token=$1, token_expires_at=$2 WHERE id=$3',
        [newToken.access_token, newToken.expires_at, connection.id]
      );
      // Update connection object in-memory
      connection.access_token = newToken.access_token;
      return await apiFn(newToken.access_token);
    }
    throw err;
  }
}

/**
 * Post to a specific platform with token-refresh wrapper
 * @param {string} platform - 'instagram' | 'facebook' | 'linkedin' | 'youtube'
 * @param {object} connection - DB row from platform_connections
 * @param {object} postData - { mediaUrl, mediaType, caption }
 * @returns {{ platformPostId: string }}
 */
async function postToPlatform(platform, connection, postData) {
  const service = services[platform];
  if (!service) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  return callWithRefresh(platform, connection, async () => {
    return service.postContent(connection, postData);
  });
}

module.exports = { postToPlatform, callWithRefresh, refreshToken };
