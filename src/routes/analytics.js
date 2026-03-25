const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { syncAnalytics } = require('../services/analyticsSync');

router.get('/', async (req, res) => {
  try {
    // Summary cards: total likes, views, reach
    const { rows: summary } = await pool.query(`
      SELECT 
        SUM(likes) as total_likes, 
        SUM(views) as total_views, 
        SUM(reach) as total_reach
      FROM (
        SELECT analytics_snapshots.likes, analytics_snapshots.views, analytics_snapshots.reach,
               ROW_NUMBER() OVER(PARTITION BY analytics_snapshots.post_result_id ORDER BY analytics_snapshots.snapped_at DESC) as rn
        FROM analytics_snapshots
        JOIN post_results pr ON analytics_snapshots.post_result_id = pr.id
        JOIN posts p ON pr.post_id = p.id
        WHERE p.user_id = $1
      ) latest
      WHERE rn = 1
    `, [req.session.userId]);

    // Per-platform table: posts, avg likes, avg views
    const { rows: platformStats } = await pool.query(`
      SELECT 
        pr.platform,
        COUNT(DISTINCT pr.id) as total_posts,
        ROUND(AVG(latest.likes)) as avg_likes,
        ROUND(AVG(latest.views)) as avg_views
      FROM post_results pr
      JOIN posts p ON pr.post_id = p.id
      LEFT JOIN (
        SELECT post_result_id, likes, views,
               ROW_NUMBER() OVER(PARTITION BY post_result_id ORDER BY snapped_at DESC) as rn
        FROM analytics_snapshots
      ) latest ON latest.post_result_id = pr.id AND latest.rn = 1
      WHERE p.user_id = $1 AND pr.status = 'success'
      GROUP BY pr.platform
    `, [req.session.userId]);

    // Recent posts with engagement
    const { rows: recentPosts } = await pool.query(`
      SELECT 
        p.id, 
        p.caption_original, 
        p.media_url, 
        pr.platform, 
        COALESCE(latest.likes, 0) as likes,
        COALESCE(latest.views, 0) as views,
        COALESCE(latest.comments, 0) as comments
      FROM post_results pr
      JOIN posts p ON pr.post_id = p.id
      LEFT JOIN (
        SELECT post_result_id, likes, views, comments,
               ROW_NUMBER() OVER(PARTITION BY post_result_id ORDER BY snapped_at DESC) as rn
        FROM analytics_snapshots
      ) latest ON latest.post_result_id = pr.id AND latest.rn = 1
      WHERE p.user_id = $1 AND pr.status = 'success'
      ORDER BY p.created_at DESC
      LIMIT 10
    `, [req.session.userId]);

    const stats = summary[0] || { total_likes: 0, total_views: 0, total_reach: 0 };

    res.render('analytics', { 
      activePage: 'analytics',
      stats,
      platformStats,
      recentPosts
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load analytics');
    res.redirect('/');
  }
});

router.post('/sync', async (req, res) => {
  try {
    await syncAnalytics(req.session.userId);
    req.flash('success', 'Analytics synced successfully');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to sync analytics');
  }
  res.redirect('/analytics');
});

module.exports = router;
