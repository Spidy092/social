-- Add indexes for foreign keys and common ownership filters.
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_status_scheduled ON posts (user_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_post_results_post_id ON post_results (post_id);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_post_result_id ON analytics_snapshots (post_result_id);
CREATE INDEX IF NOT EXISTS idx_platform_connections_user_id ON platform_connections (user_id);
CREATE INDEX IF NOT EXISTS idx_publication_jobs_post_id ON publication_jobs (post_id);
CREATE INDEX IF NOT EXISTS idx_post_media_media_item_id ON post_media (media_item_id);
CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media (post_id);
