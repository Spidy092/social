const express = require('express');
const router = express.Router();
const { promises: fs } = require('fs');
const upload = require('../middleware/upload');
const { uploadFile } = require('../services/cloudinary');
const { pool, withTransaction } = require('../db');
const { enqueuePublication } = require('../services/publicationQueue');
const { validateMedia } = require('../services/mediaValidation');

// GET /upload
router.get('/upload', async (req, res) => {
  const { rows: mediaItems } = await pool.query(
    'SELECT * FROM media_items WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.render('upload', { activePage: 'upload', mediaItems });
});

function handlePostUpload(req, res, next) {
  upload.array('media', 10)(req, res, async (err) => {
    if (!err) return next();

    await cleanupFiles(req.files || []);
    const message = uploadErrorMessage(err);
    req.flash('error', message);
    return res.redirect('/upload');
  });
}

function uploadErrorMessage(err) {
  if (err.code === 'LIMIT_FILE_SIZE') return 'Upload failed: each file must be 500MB or smaller.';
  if (err.code === 'LIMIT_FILE_COUNT') return 'Upload failed: select no more than 10 files.';
  return err.message || 'Upload failed. Please try again.';
}

// POST /posts (multi-file upload)
router.post('/posts', handlePostUpload, async (req, res) => {
  const files = req.files || [];
  const { caption, platforms, scheduled_at, media_library_ids } = req.body;

  // Parse library IDs (previously uploaded media to reuse)
  const libraryIds = media_library_ids
    ? (Array.isArray(media_library_ids) ? media_library_ids : [media_library_ids])
    : [];

  if (files.length === 0 && libraryIds.length === 0) {
    req.flash('error', 'Please upload at least one media file or select from library.');
    return res.redirect('/upload');
  }

  if (!platforms || (Array.isArray(platforms) && platforms.length === 0)) {
    req.flash('error', 'Select at least one platform.');
    return cleanupAndRedirect(files, req, res);
  }

  const selectedPlatforms = Array.isArray(platforms) ? platforms : [platforms];

  // Parse platform captions
  const platformsData = {};
  selectedPlatforms.forEach(p => {
    platformsData[p] = { caption: req.body[`caption_${p}`] || caption };
  });

  try {
    // Upload new files to Cloudinary and save to media_items
    const uploadedMedia = [];
    for (const file of files) {
      const result = await uploadFile(file.path);
      await unlinkIfExists(file.path);

      const { rows: [item] } = await pool.query(
        `INSERT INTO media_items (user_id, url, public_id, media_type, original_name, file_size)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.user.id, result.url, result.publicId, result.resourceType, file.originalname, file.size]
      );
      uploadedMedia.push(item);
    }

    // Fetch library items
    let libraryMedia = [];
    if (libraryIds.length > 0) {
      const { rows } = await pool.query(
        'SELECT * FROM media_items WHERE id = ANY($1) AND user_id = $2',
        [libraryIds, req.user.id]
      );
      libraryMedia = rows;
    }

    const allMedia = [...uploadedMedia, ...libraryMedia];

    // Validate against platform constraints
    const mediaForValidation = allMedia.map(m => ({
      media_type: m.media_type,
      file_size: m.file_size,
    }));
    const validation = validateMedia(mediaForValidation, selectedPlatforms);
    if (!validation.valid) {
      req.flash('error', validation.errors.join('. '));
      return res.redirect('/upload');
    }

    // Create post (use first media for backward compat)
    const status = scheduled_at ? 'pending' : 'draft';
    const dbScheduledAt = scheduled_at ? new Date(scheduled_at) : null;

    await withTransaction(async (client) => {
      const { rows: [post] } = await client.query(
        "INSERT INTO posts (user_id, media_url, media_type, caption_original, platforms, scheduled_at, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        [
          req.user.id,
          allMedia[0].url,
          allMedia[0].media_type,
          caption,
          JSON.stringify(platformsData),
          dbScheduledAt,
          status
        ]
      );

      // Insert post_media junction rows
      for (let i = 0; i < allMedia.length; i++) {
        await client.query(
          "INSERT INTO post_media (post_id, media_item_id, position) VALUES ($1, $2, $3)",
          [post.id, allMedia[i].id, i]
        );
      }

      if (dbScheduledAt) {
        await enqueuePublication(post.id, dbScheduledAt, client);
      }

      return post;
    });

    req.flash('success', `Post created with ${allMedia.length} media file(s)!`);
    res.redirect('/schedule');
  } catch (err) {
    console.error('Post creation error:', err);
    // Cleanup any remaining temp files
    await cleanupFiles(files);
    req.flash('error', 'Error creating post: ' + err.message);
    res.redirect('/upload');
  }
});

// GET /schedule
router.get('/schedule', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
        (SELECT json_agg(pr) FROM post_results pr WHERE pr.post_id = p.id) as results,
        (SELECT json_agg(json_build_object('url', mi.url, 'media_type', mi.media_type) ORDER BY pm.position)
         FROM post_media pm JOIN media_items mi ON mi.id = pm.media_item_id WHERE pm.post_id = p.id) as media
      FROM posts p
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
    `, [req.user.id]);

    res.render('schedule', { activePage: 'schedule', posts: result.rows });
  } catch (err) {
    console.error('Schedule fetch error:', err);
    req.flash('error', 'Could not fetch posts.');
    res.render('schedule', { activePage: 'schedule', posts: [] });
  }
});

// POST /posts/:id/delete
router.post('/posts/:id/delete', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM posts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const post = result.rows[0];

    if (!post) {
      req.flash('error', 'Post not found.');
      return res.redirect('/schedule');
    }

    await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    req.flash('success', 'Post deleted.');
    res.redirect('/schedule');
  } catch (err) {
    console.error('Delete post error:', err);
    req.flash('error', 'Error deleting post.');
    res.redirect('/schedule');
  }
});

// POST /posts/:id/publish-now
router.post('/posts/:id/publish-now', async (req, res) => {
  try {
    const { id } = req.params;
    const outcome = await withTransaction(async (client) => {
      const { rows: [post] } = await client.query(
        'SELECT * FROM posts WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [id, req.user.id]
      );
      if (!post) return 'missing';
      if (post.status === 'publishing') return 'in_progress';

      const platforms = Object.keys(post.platforms || {});
      const { rows: successfulResults } = await client.query(
        'SELECT platform FROM post_results WHERE post_id = $1 AND status = $2',
        [id, 'success']
      );
      const successfulPlatforms = new Set(successfulResults.map((row) => row.platform));
      const remainingPlatforms = platforms.filter((platform) => !successfulPlatforms.has(platform));

      if (remainingPlatforms.length === 0) {
        await client.query('UPDATE posts SET status = $1, last_error = NULL WHERE id = $2', ['published', id]);
        return 'already_published';
      }

      await client.query('UPDATE posts SET status = $1, last_error = NULL WHERE id = $2', ['pending', id]);
      await enqueuePublication(id, new Date(), client, { force: true });
      return 'queued';
    });

    if (outcome === 'missing') req.flash('error', 'Post not found.');
    else if (outcome === 'in_progress') req.flash('success', 'Post is already being published.');
    else if (outcome === 'already_published') req.flash('success', 'Post has already been published to all selected platforms.');
    else req.flash('success', 'Post queued for publishing.');

    res.redirect('/schedule');
  } catch (err) {
    console.error('Publish-now error:', err);
    req.flash('error', 'Error triggering publish: ' + err.message);
    res.redirect('/schedule');
  }
});

async function cleanupAndRedirect(files, req, res) {
  await cleanupFiles(files);
  return res.redirect('/upload');
}

async function cleanupFiles(files) {
  await Promise.all((files || []).map((file) => unlinkIfExists(file.path)));
}

async function unlinkIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('Temp file cleanup failed:', err.message);
    }
  }
}

module.exports = router;
