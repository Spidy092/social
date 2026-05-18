const { pool } = require('../../db');
const instagram = require('./instagram');
const facebook = require('./facebook');
const linkedin = require('./linkedin');
const youtube = require('./youtube');
const threads = require('./threads');

const services = { instagram, facebook, linkedin, youtube, threads };

function getProvider(platform) {
  return services[platform];
}

function listProviders() {
  return Object.keys(services);
}

async function refreshToken(platform, refreshTokenValue, connection) {
  const axios = require('axios');

  if (platform === 'instagram' || platform === 'facebook') {
    const { data } = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: refreshTokenValue,
      },
    });
    const expiresAt = new Date(Date.now() + (data.expires_in || 5184000) * 1000);

    if (platform === 'facebook') {
      const { data: pages } = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: { access_token: data.access_token },
      });
      const page = pages.data?.find((item) => item.id === connection.platform_user_id) || pages.data?.[0];
      if (!page) throw new Error('Unable to refresh Facebook page token');
      return { access_token: page.access_token, refresh_token: data.access_token, expires_at: expiresAt };
    }

    return { access_token: data.access_token, refresh_token: data.access_token, expires_at: expiresAt };
  }

  if (platform === 'linkedin') {
    const { data } = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'refresh_token',
        refresh_token: refreshTokenValue,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      },
    });
    return { access_token: data.access_token, refresh_token: data.refresh_token || refreshTokenValue, expires_at: new Date(Date.now() + (data.expires_in || 5184000) * 1000) };
  }

  if (platform === 'youtube') {
    const { data } = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: {
        grant_type: 'refresh_token',
        refresh_token: refreshTokenValue,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
      },
    });
    return { access_token: data.access_token, refresh_token: refreshTokenValue, expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000) };
  }

  throw new Error(`Token refresh not implemented for platform: ${platform}`);
}

async function callWithRefresh(platform, connection, apiFn) {
  try {
    return await apiFn(connection.access_token);
  } catch (err) {
    if (err.response?.status === 401 && connection.refresh_token) {
      const newToken = await refreshToken(platform, connection.refresh_token, connection);
      await pool.query(
        'UPDATE platform_connections SET access_token=$1, refresh_token=$2, token_expires_at=$3 WHERE id=$4',
        [newToken.access_token, newToken.refresh_token || connection.refresh_token, newToken.expires_at, connection.id]
      );
      connection.access_token = newToken.access_token;
      connection.refresh_token = newToken.refresh_token || connection.refresh_token;
      return apiFn(newToken.access_token);
    }
    throw err;
  }
}

async function postToPlatform(platform, connection, postData) {
  const service = getProvider(platform);
  if (!service) throw new Error(`Unknown platform: ${platform}`);
  return callWithRefresh(platform, connection, () => service.postContent(connection, postData));
}

async function fetchAnalytics(platform, connection, platformPostId) {
  const service = getProvider(platform);
  if (!service?.fetchAnalytics) return null;
  return callWithRefresh(platform, connection, () => service.fetchAnalytics(connection, platformPostId));
}

module.exports = { postToPlatform, fetchAnalytics, callWithRefresh, refreshToken, getProvider, listProviders };
