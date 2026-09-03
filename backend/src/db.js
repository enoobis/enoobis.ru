import Database from "better-sqlite3";
import { ensureShopCategoryTables } from "./utils/shopCategories.js";
import { backfillAllUsersFollowAdmins } from "./utils/adminFollow.js";
import { enforceAllTeachersStorageQuota } from "./utils/teacherStorageQuota.js";
import { LIBRARY_CATEGORY_MAX, normalizeLibraryCategory } from "./utils/libraryCategory.js";

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
    avatar_frame_url TEXT NOT NULL DEFAULT '',
    profile_cover_url TEXT NOT NULL DEFAULT '',
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
    pinned_post_type TEXT NOT NULL DEFAULT '',
    content_limits_json TEXT NOT NULL DEFAULT '{}',
    coins INTEGER NOT NULL DEFAULT 0,
    coins_penalty_until TEXT,
    last_passive_coin_at TEXT
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
    is_deleted INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0
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
    vote INTEGER NOT NULL DEFAULT 1,
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
    show_online_status INTEGER NOT NULL DEFAULT 0,
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
  db.prepare("SELECT coins FROM users LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT coins_penalty_until FROM users LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE users ADD COLUMN coins_penalty_until TEXT");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT last_passive_coin_at FROM users LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE users ADD COLUMN last_passive_coin_at TEXT");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT show_online_status FROM user_privacy_settings LIMIT 1").get();
} catch {
  try {
    db.exec(
      "ALTER TABLE user_privacy_settings ADD COLUMN show_online_status INTEGER NOT NULL DEFAULT 0",
    );
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT vote FROM blog_post_likes LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE blog_post_likes ADD COLUMN vote INTEGER NOT NULL DEFAULT 1");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT is_pinned FROM blog_posts LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE blog_posts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT vote FROM micropost_likes LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE micropost_likes ADD COLUMN vote INTEGER NOT NULL DEFAULT 1");
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

// одна тема расходилась на несколько из-за регистра, пробелов и точки на конце,
// а вставленные в поле описания темой не были никогда
try {
  const rows = db.prepare("SELECT DISTINCT category FROM library_books WHERE category != ''").all();
  const upd = db.prepare("UPDATE library_books SET category = ? WHERE category = ?");
  for (const row of rows) {
    const cleaned = normalizeLibraryCategory(row.category);
    const next = cleaned.length > LIBRARY_CATEGORY_MAX ? "" : cleaned;
    if (next !== row.category) upd.run(next, row.category);
  }
} catch (e) {
  console.warn("migration library_books.category normalize:", e?.message ?? e);
}

try {
  db.prepare("SELECT cover_url FROM library_books LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE library_books ADD COLUMN cover_url TEXT NOT NULL DEFAULT ''");
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
  db.prepare("SELECT kind FROM chat_threads LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE chat_threads ADD COLUMN kind TEXT NOT NULL DEFAULT 'dm'");
    db.exec("ALTER TABLE chat_threads ADD COLUMN title TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE chat_threads ADD COLUMN owner_id TEXT");
  } catch {
    // ignore
  }
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_thread_members (
      thread_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      last_read_at TEXT,
      PRIMARY KEY (thread_id, user_id),
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_thread_members_user ON chat_thread_members(user_id);
  `);
} catch {
  // ignore
}

try {
  db.prepare("SELECT avatar_url FROM chat_threads LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE chat_threads ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''");
  } catch (e) {
    console.warn("migration chat_threads.avatar_url:", e?.message ?? e);
  }
}

try {
  const dmIdx = get(
    "SELECT 1 AS v FROM sqlite_master WHERE type='index' AND name='idx_chat_threads_dm'",
  );
  if (!dmIdx && get("SELECT 1 AS v FROM sqlite_master WHERE type='table' AND name='chat_threads'")) {
    db.pragma("foreign_keys = OFF");
    try {
      db.exec(`
        CREATE TABLE chat_threads_new (
          id TEXT PRIMARY KEY,
          user_a_id TEXT NOT NULL,
          user_b_id TEXT NOT NULL,
          last_message_at TEXT,
          created_at TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'dm',
          title TEXT NOT NULL DEFAULT '',
          owner_id TEXT,
          avatar_url TEXT NOT NULL DEFAULT '',
          FOREIGN KEY (user_a_id) REFERENCES users(id),
          FOREIGN KEY (user_b_id) REFERENCES users(id)
        );
        INSERT INTO chat_threads_new
          SELECT id, user_a_id, user_b_id, last_message_at, created_at,
                 COALESCE(kind, 'dm'), COALESCE(title, ''), owner_id, COALESCE(avatar_url, '')
          FROM chat_threads;
        DROP TABLE chat_threads;
        ALTER TABLE chat_threads_new RENAME TO chat_threads;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_dm
          ON chat_threads(user_a_id, user_b_id) WHERE kind = 'dm';
        CREATE INDEX IF NOT EXISTS idx_chat_threads_a ON chat_threads(user_a_id, last_message_at DESC);
        CREATE INDEX IF NOT EXISTS idx_chat_threads_b ON chat_threads(user_b_id, last_message_at DESC);
      `);
    } finally {
      db.pragma("foreign_keys = ON");
    }
  }
} catch (e) {
  console.warn("migration chat_threads groups:", e?.message ?? e);
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
    vote INTEGER NOT NULL DEFAULT 1,
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
    kind TEXT NOT NULL DEFAULT 'dm',
    title TEXT NOT NULL DEFAULT '',
    owner_id TEXT,
    avatar_url TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (user_a_id) REFERENCES users(id),
    FOREIGN KEY (user_b_id) REFERENCES users(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_dm
    ON chat_threads(user_a_id, user_b_id) WHERE kind = 'dm';
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
  CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

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

try {
  db.prepare("SELECT content_limits_json FROM users LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE users ADD COLUMN content_limits_json TEXT NOT NULL DEFAULT '{}'");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT avatar_frame_url FROM users LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE users ADD COLUMN avatar_frame_url TEXT NOT NULL DEFAULT ''");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT profile_cover_url FROM users LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE users ADD COLUMN profile_cover_url TEXT NOT NULL DEFAULT ''");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT profile_wallpaper_style FROM users LIMIT 1").get();
} catch {
  try {
    db.exec(
      "ALTER TABLE users ADD COLUMN profile_wallpaper_style TEXT NOT NULL DEFAULT '1'",
    );
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT stock_limit FROM shop_items LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE shop_items ADD COLUMN stock_limit INTEGER");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT preset_value FROM shop_items LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE shop_items ADD COLUMN preset_value TEXT");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT ui_font_slug FROM users LIMIT 1").get();
} catch {
  try {
    db.exec(
      "ALTER TABLE users ADD COLUMN ui_font_slug TEXT NOT NULL DEFAULT 'outfit'",
    );
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT ui_ink_hex FROM users LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE users ADD COLUMN ui_ink_hex TEXT NOT NULL DEFAULT ''");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT ui_accent_hex FROM users LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE users ADD COLUMN ui_accent_hex TEXT NOT NULL DEFAULT ''");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT ui_radius_slug FROM users LIMIT 1").get();
} catch {
  try {
    db.exec(
      "ALTER TABLE users ADD COLUMN ui_radius_slug TEXT NOT NULL DEFAULT 'default'",
    );
  } catch {
    // ignore
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS shop_avatars (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    is_animated INTEGER NOT NULL DEFAULT 0,
    added_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_shop_avatars_created ON shop_avatars(created_at DESC);

  CREATE TABLE IF NOT EXISTS user_owned_avatars (
    user_id TEXT NOT NULL,
    avatar_id TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    PRIMARY KEY (user_id, avatar_id)
  );
  CREATE INDEX IF NOT EXISTS idx_uoa_user ON user_owned_avatars(user_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS shop_items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    is_animated INTEGER NOT NULL DEFAULT 0,
    stock_limit INTEGER,
    preset_value TEXT,
    added_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_shop_items_kind ON shop_items(kind);
  CREATE INDEX IF NOT EXISTS idx_shop_items_created ON shop_items(created_at DESC);

  CREATE TABLE IF NOT EXISTS user_owned_shop_items (
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    PRIMARY KEY (user_id, item_id)
  );
  CREATE INDEX IF NOT EXISTS idx_uosi_user ON user_owned_shop_items(user_id);
`);

try {
  const n = /** @type {{ c?: number }} */ (get("SELECT COUNT(*) as c FROM shop_items"))?.c ?? 0;
  if (n === 0) {
    const avs = all("SELECT id, name, url, price, is_animated, added_by, created_at FROM shop_avatars");
    for (const a of avs) {
      run(
        `INSERT OR IGNORE INTO shop_items (id, kind, name, url, price, is_animated, added_by, created_at)
         VALUES (?, 'avatar', ?, ?, ?, ?, ?, ?)`,
        a.id,
        a.name,
        a.url,
        a.price ?? 0,
        a.is_animated ?? 0,
        a.added_by,
        a.created_at,
      );
    }
    const owns = all("SELECT user_id, avatar_id as item_id, acquired_at FROM user_owned_avatars");
    for (const o of owns) {
      run(
        `INSERT OR IGNORE INTO user_owned_shop_items (user_id, item_id, acquired_at) VALUES (?, ?, ?)`,
        o.user_id,
        o.item_id,
        o.acquired_at,
      );
    }
  }
} catch {
  // ignore
}

try {
  run("UPDATE shop_items SET kind = 'special' WHERE kind = 'cover'");
} catch {
  // ignore
}

try {
  db.prepare("SELECT icon_url FROM courses LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE courses ADD COLUMN icon_url TEXT NOT NULL DEFAULT ''");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT is_pinned FROM courses LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE courses ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT category FROM shop_items LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE shop_items ADD COLUMN category TEXT NOT NULL DEFAULT ''");
  } catch {
    // ignore
  }
}

try {
  db.prepare("SELECT position FROM course_lectures LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE course_lectures ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
    /* существующие темы нумеруем в порядке создания */
    db.exec(`
      UPDATE course_lectures SET position = (
        SELECT COUNT(*) FROM course_lectures older
        WHERE older.course_id = course_lectures.course_id
          AND (older.created_at < course_lectures.created_at
            OR (older.created_at = course_lectures.created_at AND older.rowid < course_lectures.rowid))
      )
    `);
  } catch {
    // ignore
  }
}

try {
  ensureShopCategoryTables();
} catch {
  // ignore
}

try {
  db.exec("DROP TABLE IF EXISTS call_sessions");
} catch {
  // ignore
}

try {
  db.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at)");
} catch {
  // ignore
}

try {
  backfillAllUsersFollowAdmins();
} catch {
  // ignore
}

try {
  enforceAllTeachersStorageQuota();
} catch {
  // ignore
}

try {
  db.prepare("SELECT token_version FROM users LIMIT 1").get();
} catch {
  try {
    db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0");
  } catch {
    // ignore
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT NOT NULL DEFAULT '',
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (admin_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);

  CREATE TABLE IF NOT EXISTS qr_login_codes (
    code TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_qr_login_expires ON qr_login_codes(expires_at);

  CREATE TABLE IF NOT EXISTS qr_login_requests (
    code TEXT PRIMARY KEY,
    user_id TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    approved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_qr_requests_expires ON qr_login_requests(expires_at);

  CREATE TABLE IF NOT EXISTS work_points (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    radius_m INTEGER NOT NULL DEFAULT 250,
    qr_secret TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS work_checkins (
    id TEXT PRIMARY KEY,
    point_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    distance_m INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (point_id) REFERENCES work_points(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_work_checkins_created ON work_checkins(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_work_checkins_user ON work_checkins(user_id);

  CREATE TABLE IF NOT EXISTS ai_usage (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day, kind)
  );

  CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ai_chat_thread
    ON ai_chat_messages(user_id, course_id, created_at);
`);