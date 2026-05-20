const { pool } = require('../db');
const { postToPlatform } = require('./platforms');

function publishErrorMessage(err) {
  const metaError = err.response?.data?.error;
  if (metaError?.message) {
    const code = metaError.code ? ` (code ${metaError.code})` : '';
    return `${metaError.message}${code}`;
  }

  if (err.response?.data) {
    try {
      return JSON.stringify(err.response.data);
    } catch (_) {
      return err.message || 'Unknown publish error';
    }
  }

  return err.message || 'Unknown publish error';
}

async function publishPost(postId) {
  const { rows: [post] } = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
  if (!post) throw new Error(`Post ${postId} not found`);

  // Fetch all media for this post
  const { rows: mediaRows } = await pool.query(
    `SELECT mi.url, mi.media_type FROM post_media pm
     JOIN media_items mi ON mi.id = pm.media_item_id
     WHERE pm.post_id = $1 ORDER BY pm.position`,
    [postId]
  );
  const mediaUrls = mediaRows.length > 0 ? mediaRows : [{ url: post.media_url, media_type: post.media_type }];

  const platforms = Object.keys(post.platforms || {});
  const { rows: successfulResults } = await pool.query(
    'SELECT platform FROM post_results WHERE post_id = $1 AND status = $2',
    [post.id, 'success']
  );
  const successfulPlatforms = new Set(successfulResults.map((row) => row.platform));
  const platformsToPublish = platforms.filter((platform) => !successfulPlatforms.has(platform));

  if (platformsToPublish.length === 0) {
    await pool.query('UPDATE posts SET status = $1, last_error = NULL WHERE id = $2', ['published', post.id]);
    return { allOk: true, remainingPlatforms: [] };
  }

  await pool.query('UPDATE posts SET status = $1 WHERE id = $2', ['publishing', post.id]);

  const results = await Promise.allSettled(platformsToPublish.map(async (platform) => {
    const { rows: [connection] } = await pool.query(
      'SELECT * FROM platform_connections WHERE user_id = $1 AND platform = $2',
      [post.user_id, platform]
    );
    if (!connection) throw new Error(`No connection for ${platform}`);

    const caption = post.platforms[platform]?.caption || post.caption_original;
    const result = await postToPlatform(platform, connection, {
      mediaUrl: post.media_url,
      mediaType: post.media_type,
      caption,
      mediaUrls,
    });

    await pool.query(
      `INSERT INTO post_results (post_id, platform, status, platform_post_id)
       VALUES ($1, $2, 'success', $3)
       ON CONFLICT DO NOTHING`,
      [post.id, platform, result.platformPostId]
    );
    await pool.query(
      'DELETE FROM post_results WHERE post_id = $1 AND platform = $2 AND status = $3',
      [post.id, platform, 'failed']
    );
  }));

  const failures = [];
  for (let index = 0; index < results.length; index++) {
    if (results[index].status === 'rejected') {
      const errorMessage = publishErrorMessage(results[index].reason);
      failures.push(`${platformsToPublish[index]}: ${errorMessage}`);
      await pool.query(
        `INSERT INTO post_results (post_id, platform, status, error_message, posted_at)
         VALUES ($1, $2, 'failed', $3, NOW())
         ON CONFLICT (post_id, platform) WHERE status = 'failed'
         DO UPDATE SET error_message = EXCLUDED.error_message, posted_at = NOW()`,
        [post.id, platformsToPublish[index], errorMessage]
      );
    }
  }

  const allOk = failures.length === 0;
  await pool.query(
    'UPDATE posts SET status = $1, last_error = $2 WHERE id = $3',
    [allOk ? 'published' : 'failed', allOk ? null : failures.join('; '), post.id]
  );

  return { allOk, remainingPlatforms: failures.map((failure) => failure.split(':')[0]), error: failures.join('; ') };
}

module.exports = { publishPost };
