PRAGMA foreign_keys = ON;

ALTER TABLE blog_posts ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived'));
ALTER TABLE blog_posts ADD COLUMN published_at TEXT;
ALTER TABLE blog_posts ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_posts ADD COLUMN slug TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_posts ADD COLUMN excerpt TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_posts ADD COLUMN cover_image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_posts ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;

UPDATE blog_posts
SET
    status = 'published',
    published_at = created_at,
    updated_at = created_at,
    slug = id
WHERE status IS NULL OR status = '' OR published_at IS NULL OR updated_at = '' OR slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published ON blog_posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_author_status ON blog_posts(author_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS blog_comments (
    id TEXT PRIMARY KEY NOT NULL,
    post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id TEXT REFERENCES blog_comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blog_comments_post_created ON blog_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_blog_comments_user_created ON blog_comments(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blog_post_likes (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_blog_post_likes_post ON blog_post_likes(post_id);

CREATE TABLE IF NOT EXISTS blog_post_bookmarks (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_blog_post_bookmarks_post ON blog_post_bookmarks(post_id);

CREATE TABLE IF NOT EXISTS blog_tags (
    id TEXT PRIMARY KEY NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS blog_post_tags (
    post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_blog_post_tags_tag ON blog_post_tags(tag_id, post_id);

CREATE TABLE IF NOT EXISTS blog_categories (
    id TEXT PRIMARY KEY NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS blog_post_categories (
    post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES blog_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_blog_post_categories_category ON blog_post_categories(category_id, post_id);

CREATE TABLE IF NOT EXISTS blog_reports (
    id TEXT PRIMARY KEY NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
    target_post_id TEXT REFERENCES blog_posts(id) ON DELETE CASCADE,
    target_comment_id TEXT REFERENCES blog_comments(id) ON DELETE CASCADE,
    reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_blog_reports_status_created ON blog_reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS blog_post_images (
    id TEXT PRIMARY KEY NOT NULL,
    post_id TEXT REFERENCES blog_posts(id) ON DELETE CASCADE,
    uploader_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blog_post_images_post_created ON blog_post_images(post_id, created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS blog_posts_fts USING fts5(
    post_id UNINDEXED,
    title,
    body
);

INSERT INTO blog_posts_fts (post_id, title, body)
SELECT id, title, body
FROM blog_posts
WHERE status = 'published' AND is_deleted = 0;

CREATE TRIGGER IF NOT EXISTS blog_posts_ai_fts
AFTER INSERT ON blog_posts
BEGIN
    INSERT INTO blog_posts_fts (post_id, title, body)
    SELECT NEW.id, NEW.title, NEW.body
    WHERE NEW.status = 'published' AND NEW.is_deleted = 0;
END;

CREATE TRIGGER IF NOT EXISTS blog_posts_ad_fts
AFTER DELETE ON blog_posts
BEGIN
    DELETE FROM blog_posts_fts WHERE post_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS blog_posts_au_fts
AFTER UPDATE ON blog_posts
BEGIN
    DELETE FROM blog_posts_fts WHERE post_id = OLD.id;
    INSERT INTO blog_posts_fts (post_id, title, body)
    SELECT NEW.id, NEW.title, NEW.body
    WHERE NEW.status = 'published' AND NEW.is_deleted = 0;
END;
