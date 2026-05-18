-- Media library: stores all uploaded media for reuse
CREATE TABLE IF NOT EXISTS media_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  public_id TEXT,
  media_type TEXT NOT NULL,
  original_name TEXT,
  file_size INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_items_user ON media_items (user_id, created_at DESC);

-- Junction table: posts can have multiple media
CREATE TABLE IF NOT EXISTS post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  media_item_id UUID REFERENCES media_items(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media (post_id, position);

-- Make posts.media_url nullable (multi-media posts use post_media instead)
ALTER TABLE posts ALTER COLUMN media_url DROP NOT NULL;
ALTER TABLE posts ALTER COLUMN media_type DROP NOT NULL;
