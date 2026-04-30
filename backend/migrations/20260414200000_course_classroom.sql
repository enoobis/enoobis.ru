PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS course_stream_posts (
  id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_at TEXT NOT NULL DEFAULT '',
  max_points INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_assignment_submissions (
  id TEXT PRIMARY KEY NOT NULL,
  assignment_id TEXT NOT NULL REFERENCES course_assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded')),
  grade_points INTEGER,
  teacher_comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_course_stream_posts_course
  ON course_stream_posts(course_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_assignments_course
  ON course_assignments(course_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_assignment_submissions_assignment
  ON course_assignment_submissions(assignment_id, created_at DESC);
