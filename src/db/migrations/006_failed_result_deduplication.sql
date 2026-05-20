-- Keep one current failed result row per post/platform so retries do not create noisy duplicate history.
DELETE FROM post_results older
USING post_results newer
WHERE older.status = 'failed'
  AND newer.status = 'failed'
  AND older.post_id = newer.post_id
  AND older.platform = newer.platform
  AND (
    older.posted_at < newer.posted_at
    OR (older.posted_at = newer.posted_at AND older.id < newer.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_results_unique_failed
  ON post_results (post_id, platform)
  WHERE status = 'failed';
