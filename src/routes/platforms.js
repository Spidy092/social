const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');

const router = express.Router();
const callbackRouter = express.Router();

// ─── Helpers ──────────────────────────────────────────────

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

function selectMetaPage(pages, target) {
  if (!pages || pages.length === 0) return null;
  if (target === 'instagram') {
    return pages.find((page) => page.instagram_business_account) || pages[0];
  }
  return pages[0];
}

// ─── GET /platforms — list connections ────────────────────

router.get('/', async (req, res) => {
  try {
    const { rows: connections } = await db.query(
      'SELECT * FROM platform_connections WHERE user_id = $1',
      [req.session.userId]
    );

    const platforms = ['instagram', 'facebook', 'linkedin', 'youtube', 'threads'];
    const connectionMap = {};
    platforms.forEach(p => {
      const conn = connections.find(c => c.platform === p);
      connectionMap[p] = conn || null;
    });

    res.render('platforms', { activePage: 'platforms', connections: connectionMap });
  } catch (err) {
    console.error('[platforms] list error:', err.message);
    req.flash('error', 'Failed to load platform connections');
    res.render('platforms', { activePage: 'platforms', connections: {} });
  }
});

// ─── GET /platforms/:platform/connect — initiate OAuth ───

router.get('/meta/connect', (req, res) => {
  const state = generateState();
  const target = ['facebook', 'instagram'].includes(req.query.target) ? req.query.target : 'meta';
  req.session.oauthState = state;
  req.session.metaConnectTarget = target;

  const paramsData = {
    client_id: process.env.META_APP_ID,
    redirect_uri: process.env.META_REDIRECT_URI,
    response_type: 'code',
    state,
  };

  // Facebook Login for Business apps use a login configuration instead of raw scopes.
  // Keep scope fallback for older/general Meta apps and local experimentation.
  if (process.env.META_CONFIG_ID) {
    paramsData.config_id = process.env.META_CONFIG_ID;
    paramsData.override_default_response_type = 'true';
  } else {
    paramsData.scope = 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';
  }

  const params = new URLSearchParams(paramsData);
  res.redirect(`https://www.facebook.com/v18.0/dialog/oauth?${params}`);
});

router.get('/linkedin/connect', (req, res) => {
  const state = generateState();
  req.session.oauthState = state;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    scope: 'openid profile w_member_social',
    state
  });
  res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`);
});

router.get('/youtube/connect', (req, res) => {
  const state = generateState();
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    scope: 'openid email profile https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl',
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    state
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/threads/connect', (req, res) => {
  const state = generateState();
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: process.env.THREADS_APP_ID,
    redirect_uri: process.env.THREADS_REDIRECT_URI,
    scope: 'threads_basic,threads_content_publish',
    response_type: 'code',
    state
  });
  res.redirect(`https://threads.net/oauth/authorize?${params}`);
});

// ─── DELETE /platforms/:platform/disconnect ───────────────

router.delete('/:platform/disconnect', async (req, res) => {
  const { platform } = req.params;
  const allowed = ['instagram', 'facebook', 'linkedin', 'youtube', 'threads'];
  if (!allowed.includes(platform)) {
    req.flash('error', 'Unknown platform');
    return res.redirect('/platforms');
  }

  try {
    await db.query(
      'DELETE FROM platform_connections WHERE user_id = $1 AND platform = $2',
      [req.session.userId, platform]
    );

    // If disconnecting instagram or facebook, also remove the other Meta connection
    if (platform === 'instagram' || platform === 'facebook') {
      const otherPlatform = platform === 'instagram' ? 'facebook' : 'instagram';
      await db.query(
        'DELETE FROM platform_connections WHERE user_id = $1 AND platform = $2',
        [req.session.userId, otherPlatform]
      );
      req.flash('success', `Instagram & Facebook disconnected`);
    } else {
      req.flash('success', `${platform.charAt(0).toUpperCase() + platform.slice(1)} disconnected`);
    }
  } catch (err) {
    console.error(`[platforms] disconnect ${platform} error:`, err.message);
    req.flash('error', `Failed to disconnect ${platform}`);
  }

  res.redirect('/platforms');
});

// ═══════════════════════════════════════════════════════════
// CALLBACK ROUTES (public — mounted before requireLogin)
// ═══════════════════════════════════════════════════════════

// ─── Meta callback (Instagram + Facebook) ────────────────

callbackRouter.get('/meta/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    req.flash('error', `Meta authorization failed: ${oauthError}`);
    return res.redirect('/platforms');
  }

  // CSRF verification
  if (!state || state !== req.session.oauthState) {
    req.flash('error', 'OAuth state mismatch — possible CSRF attack. Please try again.');
    return res.redirect('/platforms');
  }
  delete req.session.oauthState;

  try {
    // Exchange code for access token
    const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: process.env.META_REDIRECT_URI,
        code
      }
    });

    const { access_token, expires_in } = tokenRes.data;
    const tokenExpiresAt = new Date(Date.now() + (expires_in || 5184000) * 1000);

    // Exchange for long-lived token
    const longLivedRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: access_token
      }
    });

    const longToken = longLivedRes.data.access_token || access_token;
    const longExpiresAt = longLivedRes.data.expires_in
      ? new Date(Date.now() + longLivedRes.data.expires_in * 1000)
      : tokenExpiresAt;

    // Get Facebook user info + pages
    const userRes = await axios.get('https://graph.facebook.com/v18.0/me', {
      params: { fields: 'id,name', access_token: longToken }
    });

    // Get pages for Facebook posting. Request fields explicitly so we can see why
    // a connection did or did not become publishable.
    const pagesRes = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        fields: 'id,name,access_token,instagram_business_account',
        access_token: longToken,
      }
    });

    const pages = pagesRes.data?.data || [];
    console.log(`[platforms] Meta callback: user=${userRes.data.id}, pages_returned=${pages.length}`);

    const userId = req.session.userId;
    const target = req.session.metaConnectTarget || 'meta';
    delete req.session.metaConnectTarget;
    let fbUsername = null;
    let igUsername = null;
    const connected = [];
    const page = selectMetaPage(pages, target);

    // Upsert Facebook connection (store longToken as refresh_token for re-exchange)
    if (page) {
      await db.query(
        `INSERT INTO platform_connections (user_id, platform, access_token, refresh_token, token_expires_at, platform_user_id, platform_username)
         VALUES ($1, 'facebook', $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, platform) DO UPDATE SET
           access_token = $2, refresh_token = $3, token_expires_at = $4, platform_user_id = $5, platform_username = $6`,
        [userId, page.access_token, longToken, longExpiresAt, page.id, page.name || 'Facebook Page']
      );
      fbUsername = page.name || 'Facebook Page';
      connected.push(`Facebook (${fbUsername})`);
    }

    // Get Instagram Business Account linked to the selected page
    if (page) {
      try {
        const igAccount = page.instagram_business_account;

        if (igAccount) {
          const igId = igAccount.id;
          // Get IG username
          const igUserRes = await axios.get(`https://graph.facebook.com/v18.0/${igId}`, {
            params: { fields: 'id,username', access_token: longToken }
          });
          igUsername = igUserRes.data.username || 'Instagram User';

          await db.query(
            `INSERT INTO platform_connections (user_id, platform, access_token, refresh_token, token_expires_at, platform_user_id, platform_username)
             VALUES ($1, 'instagram', $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, platform) DO UPDATE SET
               access_token = $2, refresh_token = $3, token_expires_at = $4, platform_user_id = $5, platform_username = $6`,
            [userId, longToken, longToken, longExpiresAt, igId, igUsername]
          );
        }
      } catch (igErr) {
        console.warn('[platforms] Could not fetch Instagram business account:', igErr.response?.data || igErr.message);
      }
    }

    if (igUsername) connected.push(`Instagram (@${igUsername})`);

    if (target === 'instagram' && !igUsername && page) {
      console.warn('[platforms] Instagram connection requested, but selected page has no instagram_business_account:', {
        pageId: page.id,
        pageName: page.name,
        pagesReturned: pages.length,
      });
      req.flash('error', 'Facebook connected, but no linked Instagram Business/Creator account was found. Link Instagram to the selected Facebook Page in Meta, then reconnect Instagram.');
    } else if (connected.length === 0) {
      console.warn('[platforms] Meta callback completed but no publishable Pages were returned. Check Business Login configuration, selected assets, and Page ownership.');
      req.flash('error', 'Meta login worked, but no Facebook Page was returned. Select a Page in Meta permissions and make sure this Facebook account manages a Page.');
    } else {
      req.flash('success', `Connected: ${connected.join(' & ')}`);
    }
  } catch (err) {
    console.error('[platforms] Meta callback error:', err.response?.data || err.message);
    req.flash('error', 'Failed to connect Meta accounts. Check app credentials.');
  }

  res.redirect('/platforms');
});

// ─── LinkedIn callback ───────────────────────────────────

callbackRouter.get('/linkedin/callback', async (req, res) => {
  const { code, state, error: oauthError, error_description } = req.query;

  if (oauthError) {
    req.flash('error', `LinkedIn authorization failed: ${error_description || oauthError}`);
    return res.redirect('/platforms');
  }

  if (!state || state !== req.session.oauthState) {
    req.flash('error', 'OAuth state mismatch — possible CSRF attack. Please try again.');
    return res.redirect('/platforms');
  }
  delete req.session.oauthState;

  try {
    // Exchange code for access token
    const tokenRes = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, expires_in, refresh_token } = tokenRes.data;
    const tokenExpiresAt = new Date(Date.now() + (expires_in || 5184000) * 1000);

    // Get person URN
    const userInfoRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const personId = userInfoRes.data.sub;
    const displayName = userInfoRes.data.name || userInfoRes.data.given_name || 'LinkedIn User';

    await db.query(
      `INSERT INTO platform_connections (user_id, platform, access_token, refresh_token, token_expires_at, platform_user_id, platform_username)
       VALUES ($1, 'linkedin', $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, platform) DO UPDATE SET
         access_token = $2, refresh_token = $3, token_expires_at = $4, platform_user_id = $5, platform_username = $6`,
      [req.session.userId, access_token, refresh_token || null, tokenExpiresAt, personId, displayName]
    );

    req.flash('success', `LinkedIn connected as ${displayName}`);
  } catch (err) {
    console.error('[platforms] LinkedIn callback error:', err.response?.data || err.message);
    req.flash('error', 'Failed to connect LinkedIn. Check app credentials.');
  }

  res.redirect('/platforms');
});

// ─── YouTube / Google callback ───────────────────────────

callbackRouter.get('/youtube/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    req.flash('error', `Google authorization failed: ${oauthError}`);
    return res.redirect('/platforms');
  }

  if (!state || state !== req.session.oauthState) {
    req.flash('error', 'OAuth state mismatch — possible CSRF attack. Please try again.');
    return res.redirect('/platforms');
  }
  delete req.session.oauthState;

  try {
    // Exchange code for tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const tokenExpiresAt = new Date(Date.now() + (expires_in || 3600) * 1000);

    // Get YouTube channel info
    const channelRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: { part: 'snippet', mine: true },
      headers: { Authorization: `Bearer ${access_token}` }
    });

    let channelName = 'YouTube Channel';
    let channelId = null;
    if (channelRes.data.items && channelRes.data.items.length > 0) {
      channelName = channelRes.data.items[0].snippet.title;
      channelId = channelRes.data.items[0].id;
    }

    await db.query(
      `INSERT INTO platform_connections (user_id, platform, access_token, refresh_token, token_expires_at, platform_user_id, platform_username)
       VALUES ($1, 'youtube', $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, platform) DO UPDATE SET
         access_token = $2, refresh_token = $3, token_expires_at = $4, platform_user_id = $5, platform_username = $6`,
      [req.session.userId, access_token, refresh_token || null, tokenExpiresAt, channelId, channelName]
    );

    req.flash('success', `YouTube connected as ${channelName}`);
  } catch (err) {
    console.error('[platforms] YouTube callback error:', err.response?.data || err.message);
    req.flash('error', 'Failed to connect YouTube. Check app credentials.');
  }

  res.redirect('/platforms');
});

// ─── Threads callback ────────────────────────────────────

callbackRouter.get('/threads/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    req.flash('error', `Threads authorization failed: ${oauthError}`);
    return res.redirect('/platforms');
  }

  if (!state || state !== req.session.oauthState) {
    req.flash('error', 'OAuth state mismatch. Please try again.');
    return res.redirect('/platforms');
  }
  delete req.session.oauthState;

  try {
    // Exchange code for short-lived token
    const tokenRes = await axios.post('https://graph.threads.net/oauth/access_token', null, {
      params: {
        client_id: process.env.THREADS_APP_ID,
        client_secret: process.env.THREADS_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: process.env.THREADS_REDIRECT_URI,
        code
      }
    });

    const { access_token: shortToken, user_id: threadsUserId } = tokenRes.data;

    // Exchange for long-lived token
    const longRes = await axios.get('https://graph.threads.net/access_token', {
      params: {
        grant_type: 'th_exchange_token',
        client_secret: process.env.THREADS_APP_SECRET,
        access_token: shortToken
      }
    });

    const longToken = longRes.data.access_token || shortToken;
    const expiresAt = new Date(Date.now() + (longRes.data.expires_in || 5184000) * 1000);

    // Get profile info
    const profileRes = await axios.get(`https://graph.threads.net/v1.0/me`, {
      params: { fields: 'id,username', access_token: longToken }
    });
    const username = profileRes.data.username || 'Threads User';

    await db.query(
      `INSERT INTO platform_connections (user_id, platform, access_token, refresh_token, token_expires_at, platform_user_id, platform_username)
       VALUES ($1, 'threads', $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, platform) DO UPDATE SET
         access_token = $2, refresh_token = $3, token_expires_at = $4, platform_user_id = $5, platform_username = $6`,
      [req.session.userId, longToken, longToken, expiresAt, threadsUserId || profileRes.data.id, username]
    );

    req.flash('success', `Threads connected as @${username}`);
  } catch (err) {
    console.error('[platforms] Threads callback error:', err.response?.data || err.message);
    req.flash('error', 'Failed to connect Threads. Check app credentials.');
  }

  res.redirect('/platforms');
});

module.exports = { router, callbackRouter };
