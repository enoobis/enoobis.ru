PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS course_stream_comments (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT NOT NULL REFERENCES course_stream_posts(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_course_stream_comments_post
  ON course_stream_comments(post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_course_stream_comments_course
  ON course_stream_comments(course_id, created_at DESC);
