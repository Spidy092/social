const express = require('express');
const router = express.Router();
const db = require('../db');

function timeAgo(date) {
  if (!date) return 'Unknown time';
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';
  return Math.floor(seconds) + ' seconds ago';
}

router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;

    // Default stats
    const stats = { total: 0, published: 0, pending: 0, failed: 0 };

    // Query stats
    const { rows: statsRows } = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM posts 
      WHERE user_id = $1 
      GROUP BY status
    `, [userId]);

    statsRows.forEach(row => {
      const count = parseInt(row.count, 10);
      stats.total += count;
      if (stats[row.status] !== undefined) {
        stats[row.status] += count;
      }
    });

    // Recent 10 posts
    const { rows: recentPosts } = await db.query(`
      SELECT * 
      FROM posts 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 10
    `, [userId]);
    
    // Add timeAgo
    recentPosts.forEach(post => {
      post.timeAgo = timeAgo(post.created_at);
    });

    // Connected platforms
    const { rows: connections } = await db.query(`
      SELECT platform 
      FROM platform_connections 
      WHERE user_id = $1
    `, [userId]);
    
    // Convert to an array of platform names
    const connectedPlatforms = connections.map(c => c.platform);

    res.render('dashboard', {
      activePage: 'dashboard',
      stats,
      recentPosts,
      connectedPlatforms
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    req.flash('error', 'Failed to load dashboard data.');
    res.render('dashboard', {
      activePage: 'dashboard',
      stats: { total: 0, published: 0, pending: 0, failed: 0 },
      recentPosts: [],
      connectedPlatforms: []
    });
  }
});

module.exports = router;
