CREATE TABLE IF NOT EXISTS user_privacy_settings (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_visibility TEXT NOT NULL DEFAULT 'public' CHECK (profile_visibility IN ('public', 'followers', 'private')),
    activity_visibility TEXT NOT NULL DEFAULT 'public' CHECK (activity_visibility IN ('public', 'followers', 'private')),
    media_visibility TEXT NOT NULL DEFAULT 'public' CHECK (media_visibility IN ('public', 'followers', 'private')),
    show_birthday INTEGER NOT NULL DEFAULT 1,
    show_country INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS user_notification_settings (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_enabled INTEGER NOT NULL DEFAULT 1,
    push_enabled INTEGER NOT NULL DEFAULT 0,
    course_updates INTEGER NOT NULL DEFAULT 1,
    assignment_deadlines INTEGER NOT NULL DEFAULT 1,
    grades_released INTEGER NOT NULL DEFAULT 1,
    new_followers INTEGER NOT NULL DEFAULT 1,
    marketing_news INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO user_privacy_settings (user_id)
SELECT id FROM users
WHERE id NOT IN (SELECT user_id FROM user_privacy_settings);

INSERT INTO user_notification_settings (user_id)
SELECT id FROM users
WHERE id NOT IN (SELECT user_id FROM user_notification_settings);
