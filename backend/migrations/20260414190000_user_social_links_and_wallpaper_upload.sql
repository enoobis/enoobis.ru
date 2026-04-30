PRAGMA foreign_keys = ON;

ALTER TABLE users
ADD COLUMN social_links_json TEXT NOT NULL DEFAULT '[]';
