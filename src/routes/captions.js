const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const { generateCaptions } = require('../services/openrouter');

router.post('/generate', requireLogin, async (req, res) => {
  const { caption, platforms } = req.body;

  if (!caption) {
    return res.status(400).json({ error: 'Base caption is required.' });
  }

  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({ error: 'At least one platform must be selected.' });
  }

  try {
    const captions = await generateCaptions(caption, platforms);
    return res.json({ captions });
  } catch (err) {
    console.error('[captions.js] Error generating captions:', err);
    return res.status(503).json({ error: err.message || 'Caption generation failed' });
  }
});

module.exports = router;
