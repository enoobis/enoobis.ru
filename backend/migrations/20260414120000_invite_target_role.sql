PRAGMA foreign_keys = ON;

ALTER TABLE invite_links
ADD COLUMN target_role TEXT NOT NULL DEFAULT 'student' CHECK (target_role IN ('student', 'teacher'));

UPDATE invite_links
SET target_role = 'student'
WHERE target_role IS NULL OR target_role = '';
