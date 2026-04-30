PRAGMA foreign_keys = ON;

ALTER TABLE users
ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '';

UPDATE users
SET last_seen_at = COALESCE(NULLIF(last_seen_at, ''), created_at);
