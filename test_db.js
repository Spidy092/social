const { pool } = require('./src/db');
async function test() {
  try {
    console.log("Testing Query 1...");
    await pool.query(`
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
        WHERE p.user_id = '00000000-0000-0000-0000-000000000000'
      ) latest
      WHERE rn = 1
    `);
    console.log("Query 1 logic OK.");

    console.log("Testing Query 2...");
    await pool.query(`
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
      WHERE p.user_id = '00000000-0000-0000-0000-000000000000' AND pr.status = 'success'
      GROUP BY pr.platform
    `);
    console.log("Query 2 logic OK.");

    console.log("Testing Query 3...");
    await pool.query(`
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
      WHERE p.user_id = '00000000-0000-0000-0000-000000000000' AND pr.status = 'success'
      ORDER BY p.created_at DESC
      LIMIT 10
    `);
    console.log("Query 3 logic OK.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
test();
