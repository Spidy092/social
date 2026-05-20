const cron = require('node-cron');
const { pool } = require('../db');
const { fetchAnalytics } = require('./platforms');

async function syncAnalytics(userId, options = {}) {
  const batchSize = Number(options.batchSize || process.env.ANALYTICS_SYNC_BATCH_SIZE || 100);
  const maxAgeDays = Number(options.maxAgeDays || process.env.ANALYTICS_SYNC_MAX_AGE_DAYS || 90);
  let offset = 0;
  let synced = 0;

  while (true) {
    const { rows: results } = await pool.query(
      `SELECT pr.id as post_result_id, pr.platform, pr.platform_post_id, pc.*
       FROM post_results pr
       JOIN posts p ON pr.post_id = p.id
       JOIN platform_connections pc ON p.user_id = pc.user_id AND pr.platform = pc.platform
       WHERE p.user_id = $1
         AND pr.status = 'success'
         AND pr.platform_post_id IS NOT NULL
         AND pr.posted_at >= NOW() - ($2 || ' days')::interval
       ORDER BY pr.posted_at DESC, pr.id DESC
       LIMIT $3 OFFSET $4`,
      [userId, maxAgeDays, batchSize, offset]
    );

    if (results.length === 0) break;

    for (const result of results) {
      try {
        const stats = await fetchAnalytics(result.platform, result, result.platform_post_id);
        if (!stats) continue;

        const { rows: existing } = await pool.query(
          `SELECT id FROM analytics_snapshots
           WHERE post_result_id = $1 AND DATE(snapped_at) = CURRENT_DATE`,
          [result.post_result_id]
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
            [result.post_result_id, stats.likes, stats.comments, stats.shares, stats.views, stats.reach]
          );
        }
        synced += 1;
      } catch (err) {
        console.error(`[analytics] ${result.platform} sync failed for ${result.platform_post_id}:`, err.response?.data || err.message);
      }
    }

    if (results.length < batchSize) break;
    offset += results.length;
  }

  console.log(`[analytics] Synced stats for user ${userId}: ${synced} result(s), window=${maxAgeDays}d`);
}

function startAnalyticsCron() {
  cron.schedule('0 2 * * *', async () => {
    try {
      const { rows: users } = await pool.query('SELECT id FROM users');
      for (const user of users) await syncAnalytics(user.id);
    } catch (err) {
      console.error('[analytics] Cron error:', err.message);
    }
  });
  console.log('[analytics] Cron started — running at 2 AM daily');
}

module.exports = { syncAnalytics, startAnalyticsCron };
