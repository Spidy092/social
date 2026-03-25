const cron = require('node-cron');
const { pool } = require('../db');

// Simulate API fetch since endpoints aren't specified in PLATFORM_APIS.md
async function fetchStatsMock(platform, platformPostId) {
  return {
    likes: Math.floor(Math.random() * 50) + 10,
    comments: Math.floor(Math.random() * 10),
    shares: Math.floor(Math.random() * 5),
    views: Math.floor(Math.random() * 500) + 100,
    reach: Math.floor(Math.random() * 400) + 50
  };
}

async function syncAnalytics(userId) {
  try {
    const { rows: results } = await pool.query(
      `SELECT pr.id as post_result_id, pr.platform, pr.platform_post_id, pc.access_token 
       FROM post_results pr
       JOIN posts p ON pr.post_id = p.id
       JOIN platform_connections pc ON p.user_id = pc.user_id AND pr.platform = pc.platform
       WHERE p.user_id = $1 AND pr.status = 'success' AND pr.platform_post_id IS NOT NULL`,
      [userId]
    );

    for (const res of results) {
      // Fetch stats
      const stats = await fetchStatsMock(res.platform, res.platform_post_id);
      
      // Upsert into analytics_snapshots (one per post_result per day)
      const { rows: existing } = await pool.query(
        `SELECT id FROM analytics_snapshots 
         WHERE post_result_id = $1 AND DATE(snapped_at) = CURRENT_DATE`,
        [res.post_result_id]
      );

      if (existing.length > 0) {
        await pool.query(
          `UPDATE analytics_snapshots 
           SET likes=$1, comments=$2, shares=$3, views=$4, reach=$5
           WHERE id=$6`,
          [stats.likes, stats.comments, stats.shares, stats.views, stats.reach, existing[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO analytics_snapshots (post_result_id, likes, comments, shares, views, reach)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [res.post_result_id, stats.likes, stats.comments, stats.shares, stats.views, stats.reach]
        );
      }
    }
    console.log(`[analytics] Synced stats for user ${userId}`);
  } catch (err) {
    console.error('[analytics] Sync error:', err);
  }
}

function startAnalyticsCron() {
  cron.schedule('0 2 * * *', async () => {
    try {
      const { rows: users } = await pool.query('SELECT id FROM users');
      for (const user of users) {
        await syncAnalytics(user.id);
      }
    } catch (err) {
      console.error('[analytics] Cron error:', err.message);
    }
  });
  console.log('[analytics] Cron started — running at 2 AM daily');
}

module.exports = { syncAnalytics, startAnalyticsCron };
