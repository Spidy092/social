const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { deleteFile } = require('../services/cloudinary');

// GET /media - list user's media library
router.get('/', async (req, res) => {
  const { rows: items } = await pool.query(
    'SELECT * FROM media_items WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.render('media', { activePage: 'media', items });
});

// GET /media/json - API for upload page picker
router.get('/json', async (req, res) => {
  const { rows: items } = await pool.query(
    'SELECT id, url, media_type, original_name, created_at FROM media_items WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json(items);
});

// POST /media/:id/delete
router.post('/:id/delete', async (req, res) => {
  const { rows: [item] } = await pool.query(
    'SELECT * FROM media_items WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!item) {
    req.flash('error', 'Media not found');
    return res.redirect('/media');
  }

  try {
    if (item.public_id) await deleteFile(item.public_id, item.media_type);
  } catch (e) {
    console.error('Cloudinary delete error:', e.message);
  }

  await pool.query('DELETE FROM media_items WHERE id = $1', [req.params.id]);
  req.flash('success', 'Media deleted');
  res.redirect('/media');
});

module.exports = router;
