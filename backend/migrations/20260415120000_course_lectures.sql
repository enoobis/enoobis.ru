PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS course_lectures (
  id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_lecture_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES course_lectures(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_course_lectures_course
  ON course_lectures(course_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_lecture_attachments_lecture
  ON course_lecture_attachments(lecture_id);
