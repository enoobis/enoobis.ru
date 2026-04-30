ALTER TABLE courses ADD COLUMN course_code TEXT NOT NULL DEFAULT '';

UPDATE courses
SET course_code = UPPER(SUBSTR(HEX(RANDOMBLOB(6)), 1, 6))
WHERE course_code = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_course_code ON courses(course_code);
