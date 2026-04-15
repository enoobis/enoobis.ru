PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_follows (
  follower_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_user_id, following_user_id),
  CHECK (follower_user_id <> following_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_following
  ON user_follows(following_user_id);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower
  ON user_follows(follower_user_id);
