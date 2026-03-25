const express = require('express');
const router = express.Router();
const fs = require('fs');
const upload = require('../middleware/upload');
const { uploadFile, deleteFile } = require('../services/cloudinary');
const { pool } = require('../db');

// GET /upload
router.get('/upload', (req, res) => {
  res.render('upload', { activePage: 'upload' });
});

// POST /posts (upload middleware)
router.post('/posts', upload.single('media'), async (req, res) => {
  if (!req.file) {
    req.flash('error', 'Please upload a media file.');
    return res.redirect('/upload');
  }

  const { caption, platforms, scheduled_at } = req.body;
  
  if (!platforms || (Array.isArray(platforms) && platforms.length === 0)) {
    req.flash('error', 'Select at least one platform.');
    return res.redirect('/upload');
  }

  // Parse platforms JSON or object if it's already an object
  let platformsData = {};
  if (typeof platforms === 'string') {
    // This handles case where platforms is a checkbox array but only one is selected
    platformsData[platforms] = { caption: req.body[`caption_${platforms}`] || caption };
  } else if (Array.isArray(platforms)) {
    platforms.forEach(p => {
      platformsData[p] = { caption: req.body[`caption_${p}`] || caption };
    });
  }

  try {
    // Upload to Cloudinary
    const cloudinaryResult = await uploadFile(req.file.path);
    
    // Delete temp file
    fs.unlinkSync(req.file.path);

    // Insert into DB
    const status = scheduled_at ? 'pending' : 'draft';
    const dbScheduledAt = scheduled_at ? new Date(scheduled_at) : null;
    
    await pool.query(`
      INSERT INTO posts (user_id, media_url, media_type, caption_original, platforms, scheduled_at, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [req.user.id, cloudinaryResult.url, cloudinaryResult.resourceType, caption, JSON.stringify(platformsData), dbScheduledAt, status]);

    req.flash('success', 'Post created successfully!');
    res.redirect('/schedule');
  } catch (err) {
    console.error('Post creation error:', err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    req.flash('error', 'Error creating post: ' + err.message);
    res.redirect('/upload');
  }
});

// GET /schedule
router.get('/schedule', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, 
        (SELECT json_agg(pr) FROM post_results pr WHERE pr.post_id = p.id) as results
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

    const urlParts = post.media_url.split('/');
    const lastPart = urlParts[urlParts.length - 1];
    const publicId = `social-poster/${lastPart.split('.')[0]}`;
    
    await deleteFile(publicId, post.media_type);
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
    
    // Check if post belongs to user
    const checkResult = await pool.query('SELECT * FROM posts WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    const post = checkResult.rows[0];

    if (!post) {
      req.flash('error', 'Post not found.');
      return res.redirect('/schedule');
    }

    // Set status = 'publishing'
    await pool.query('UPDATE posts SET status = $1 WHERE id = $2', ['publishing', id]);

    // Run same publish logic as scheduler for this single post
    const { postToPlatform } = require('../services/platforms');
    const platforms = Object.keys(post.platforms);
    
    const results = await Promise.allSettled(
      platforms.map(async (platform) => {
        const { rows: [conn] } = await pool.query(
          `SELECT * FROM platform_connections WHERE user_id=$1 AND platform=$2`,
          [post.user_id, platform]
        );
        if (!conn) throw new Error(`No connection for ${platform}`);
        const caption = post.platforms[platform]?.caption || post.caption_original;
        
        const platResult = await postToPlatform(platform, conn, {
          mediaUrl: post.media_url, mediaType: post.media_type, caption
        });
        
        await pool.query(
          `INSERT INTO post_results (post_id, platform, status, platform_post_id) VALUES ($1,$2,'success',$3)`,
          [post.id, platform, platResult.platformPostId]
        );
      })
    );
    
    const allOk = results.every(r => r.status === 'fulfilled');
    await pool.query(`UPDATE posts SET status=$1 WHERE id=$2`, [allOk ? 'published' : 'failed', post.id]);
    
    // Save failed results
    for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          await pool.query(
            `INSERT INTO post_results (post_id, platform, status, error_message) VALUES ($1,$2,'failed',$3)`,
            [post.id, platforms[i], results[i].reason?.message]
          );
        }
    }

    if (allOk) {
      req.flash('success', 'Post published successfully!');
    } else {
      req.flash('error', 'Post published with some errors. Check your platform dashboards.');
    }
    res.redirect('/schedule');
  } catch (err) {
    console.error('Publish-now error:', err);
    await pool.query('UPDATE posts SET status = $1 WHERE id = $2 AND user_id = $3', ['failed', req.params.id, req.user.id]);
    req.flash('error', 'Error triggering publish: ' + err.message);
    res.redirect('/schedule');
  }
});

module.exports = router;
