const cron = require('node-cron');
const db = require('../db');
const { postToPlatform } = require('../services/platforms');

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      const { rows: posts } = await db.query(
        `SELECT * FROM posts WHERE status = 'pending' AND scheduled_at <= NOW()`
      );
      for (const post of posts) {
        await db.query(`UPDATE posts SET status = 'publishing' WHERE id = $1`, [post.id]);
        const platforms = Object.keys(post.platforms);
        const results = await Promise.allSettled(
          platforms.map(async (platform) => {
            const { rows: [conn] } = await db.query(
              `SELECT * FROM platform_connections WHERE user_id=$1 AND platform=$2`,
              [post.user_id, platform]
            );
            if (!conn) throw new Error(`No connection for ${platform}`);
            const caption = post.platforms[platform]?.caption || post.caption_original;
            const result = await postToPlatform(platform, conn, {
              mediaUrl: post.media_url, mediaType: post.media_type, caption
            });
            await db.query(
              `INSERT INTO post_results (post_id, platform, status, platform_post_id) VALUES ($1,$2,'success',$3)`,
              [post.id, platform, result.platformPostId]
            );
          })
        );
        const allOk = results.every(r => r.status === 'fulfilled');
        await db.query(`UPDATE posts SET status=$1 WHERE id=$2`, [allOk ? 'published' : 'failed', post.id]);
        // Save failed results
        for (let i = 0; i < results.length; i++) {
          if (results[i].status === 'rejected') {
            await db.query(
              `INSERT INTO post_results (post_id, platform, status, error_message) VALUES ($1,$2,'failed',$3)`,
              [post.id, platforms[i], results[i].reason?.message]
            );
          }
        }
        console.log(`[scheduler] Post ${post.id}: ${allOk ? 'published' : 'failed'}`);
      }
    } catch (err) {
      console.error('[scheduler] cron error:', err.message);
    }
  });
  console.log('[scheduler] started — checking every 60s');
}

module.exports = { startScheduler };
