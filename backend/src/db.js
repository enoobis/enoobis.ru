import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_FILE ?? "./edu.db";
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

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
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages(thread_id, read_at);

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
