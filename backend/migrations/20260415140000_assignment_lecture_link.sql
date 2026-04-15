PRAGMA foreign_keys = ON;

ALTER TABLE course_assignments ADD COLUMN lecture_id TEXT REFERENCES course_lectures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_course_assignments_lecture
  ON course_assignments(lecture_id);
