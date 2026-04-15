PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_daily_activity (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  seconds_spent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_activity_day
  ON user_daily_activity(day);
