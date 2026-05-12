import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_FILE ?? "./edu.db";
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    wallpaper_url TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    theme_preference TEXT NOT NULL DEFAULT 'black',
    language_preference TEXT NOT NULL DEFAULT 'ru',
    font_preference TEXT NOT NULL DEFAULT 'normal',
    full_name TEXT NOT NULL DEFAULT '',
    website_url TEXT NOT NULL DEFAULT '',
    social_links_json TEXT NOT NULL DEFAULT '[]',
    birthday TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    readme_md TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_seen_at TEXT,
    nickname_change_count INTEGER NOT NULL DEFAULT 0,
    pinned_post_id TEXT,
    pinned_post_type TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS blog_posts (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    published_at TEXT,
    updated_at TEXT NOT NULL,
    slug TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    cover_image_url TEXT NOT NULL DEFAULT '',
    is_deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts(author_id);
  CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published ON blog_posts(status);

  CREATE TABLE IF NOT EXISTS blog_tags (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS blog_categories (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS blog_post_tags (
    post_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (post_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS blog_post_categories (
    post_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    PRIMARY KEY (post_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS blog_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parent_comment_id TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'visible',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON blog_comments(post_id);

  CREATE TABLE IF NOT EXISTS blog_post_likes (
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, post_id)
  );
  CREATE TABLE IF NOT EXISTS blog_post_bookmarks (
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS blog_reports (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_post_id TEXT,
    target_comment_id TEXT,
    reporter_user_id TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_blog_reports_created ON blog_reports(created_at DESC);

  CREATE TABLE IF NOT EXISTS blog_post_images (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    uploader_user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invite_links (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    owner_user_id TEXT NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    target_role TEXT NOT NULL DEFAULT 'student'
  );

  CREATE TABLE IF NOT EXISTS user_follows (
    follower_user_id TEXT NOT NULL,
    following_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (follower_user_id, following_user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_user_id);

  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_open INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    course_code TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(course_code);

  CREATE TABLE IF NOT EXISTS course_students (
    course_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    PRIMARY KEY (course_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS course_lectures (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body_text TEXT NOT NULL DEFAULT '',
    video_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS course_lecture_attachments (
    id TEXT PRIMARY KEY,
    lecture_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS course_assignments (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_at TEXT,
    max_points INTEGER,
    created_at TEXT NOT NULL,
    lecture_id TEXT
  );
  CREATE TABLE IF NOT EXISTS course_assignment_submissions (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    grade_points REAL,
    teacher_comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_unique ON course_assignment_submissions(assignment_id, student_id);

  CREATE TABLE IF NOT EXISTS course_stream_posts (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS course_stream_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_favorite_courses (
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    PRIMARY KEY (user_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS user_daily_activity (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    seconds_spent INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
  );

  CREATE TABLE IF NOT EXISTS user_privacy_settings (
    user_id TEXT PRIMARY KEY,
    profile_visibility TEXT NOT NULL DEFAULT 'public',
    activity_visibility TEXT NOT NULL DEFAULT 'public',
    media_visibility TEXT NOT NULL DEFAULT 'public',
    show_birthday INTEGER NOT NULL DEFAULT 1,
    show_country INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_notification_settings (
    user_id TEXT PRIMARY KEY,
    email_enabled INTEGER NOT NULL DEFAULT 1,
    push_enabled INTEGER NOT NULL DEFAULT 0,
    course_updates INTEGER NOT NULL DEFAULT 1,
    assignment_deadlines INTEGER NOT NULL DEFAULT 1,
    grades_released INTEGER NOT NULL DEFAULT 1,
    new_followers INTEGER NOT NULL DEFAULT 1,
    marketing_news INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
`);

export function nowIso() {
  return new Date().toISOString();
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

try {
  db.prepare("SELECT readme_md FROM users LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE users ADD COLUMN readme_md TEXT NOT NULL DEFAULT ''");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT category FROM library_books LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE library_books ADD COLUMN category TEXT NOT NULL DEFAULT ''");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT image_url FROM chat_messages LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE chat_messages ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT edited_at FROM chat_messages LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE chat_messages ADD COLUMN edited_at TEXT");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT reply_to_id FROM chat_messages LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE chat_messages ADD COLUMN reply_to_id TEXT");
  } catch {
    // ignore
  }
}

try {
  db.prepare(`
    UPDATE blog_reports SET target_post_id = (
      SELECT post_id FROM blog_comments WHERE blog_comments.id = blog_reports.target_comment_id
    )
    WHERE target_type = 'comment'
      AND target_comment_id IS NOT NULL
      AND (target_post_id IS NULL OR target_post_id = '')
  `).run();
} catch {
  // ignore
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_thread_hidden (
      user_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      PRIMARY KEY (user_id, thread_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_thread_hidden_user ON chat_thread_hidden(user_id);
  `);
} catch {
  // ignore
}

try {
  db.prepare("SELECT nickname_change_count FROM users LIMIT 1").get();
} catch {
  try {
    db.exec(
      "ALTER TABLE users ADD COLUMN nickname_change_count INTEGER NOT NULL DEFAULT 0",
    );
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT pinned_post_id FROM users LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE users ADD COLUMN pinned_post_id TEXT");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT pinned_post_type FROM users LIMIT 1").get();
} catch {
  try {
    db.exec(
      "ALTER TABLE users ADD COLUMN pinned_post_type TEXT NOT NULL DEFAULT ''",
    );
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT pinned_course_ids FROM users LIMIT 1").get();
} catch {
  try {
    db.exec(
      "ALTER TABLE users ADD COLUMN pinned_course_ids TEXT NOT NULL DEFAULT '[]'",
    );
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT hidden_course_ids FROM users LIMIT 1").get();
} catch {
  try {
    db.exec(
      "ALTER TABLE users ADD COLUMN hidden_course_ids TEXT NOT NULL DEFAULT '[]'",
    );
  } catch {
    // ignore
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS course_submission_attachments (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    url TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_csa_submission ON course_submission_attachments(submission_id);

  CREATE TABLE IF NOT EXISTS course_co_teachers (
    course_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (course_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_cct_course ON course_co_teachers(course_id);
  CREATE INDEX IF NOT EXISTS idx_cct_user ON course_co_teachers(user_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS microposts (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL,
    body TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    parent_id TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES microposts(id)
  );
  CREATE INDEX IF NOT EXISTS idx_microposts_created ON microposts(created_at);
  CREATE INDEX IF NOT EXISTS idx_microposts_author ON microposts(author_id);
  CREATE INDEX IF NOT EXISTS idx_microposts_parent ON microposts(parent_id);

  CREATE TABLE IF NOT EXISTS micropost_likes (
    micropost_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (micropost_id, user_id),
    FOREIGN KEY (micropost_id) REFERENCES microposts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS inbox_notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (actor_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_inbox_user ON inbox_notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_inbox_unread ON inbox_notifications(user_id, read_at);

  CREATE TABLE IF NOT EXISTS chat_threads (
    id TEXT PRIMARY KEY,
    user_a_id TEXT NOT NULL,
    user_b_id TEXT NOT NULL,
    last_message_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (user_a_id, user_b_id),
    FOREIGN KEY (user_a_id) REFERENCES users(id),
    FOREIGN KEY (user_b_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_threads_a ON chat_threads(user_a_id, last_message_at DESC);
  CREATE INDEX IF NOT EXISTS idx_chat_threads_b ON chat_threads(user_b_id, last_message_at DESC);

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    body TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL,
    reply_to_id TEXT,
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages(thread_id, read_at);

  CREATE TABLE IF NOT EXISTS chat_thread_hidden (
    user_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    PRIMARY KEY (user_id, thread_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_thread_hidden_user ON chat_thread_hidden(user_id);

  CREATE TABLE IF NOT EXISTS user_files (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT '',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_files_owner ON user_files(owner_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS user_notes (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_notes_owner ON user_notes(owner_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    owner_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_share_links_owner ON share_links(owner_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_share_links_target ON share_links(target_type, target_id);

  CREATE TABLE IF NOT EXISTS library_books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    storage_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT '',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    uploaded_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_library_books_created ON library_books(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_library_books_category ON library_books(category);

  CREATE TABLE IF NOT EXISTS micropost_bookmarks (
    micropost_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (micropost_id, user_id),
    FOREIGN KEY (micropost_id) REFERENCES microposts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_micropost_bookmarks_user ON micropost_bookmarks(user_id, created_at DESC);

`);

try {
  db.prepare("SELECT achievement_key FROM user_achievements LIMIT 1").get();
} catch {
  try {
    db.exec("DROP TABLE IF EXISTS user_achievements");
  } catch {
    // ignore
  }
  try {
    db.exec(`
      CREATE TABLE user_achievements (
        user_id TEXT NOT NULL,
        achievement_key TEXT NOT NULL,
        earned_at TEXT NOT NULL,
        PRIMARY KEY (user_id, achievement_key),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id, earned_at DESC);
    `);
  } catch {
    // ignore
  }
}
