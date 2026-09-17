import "dotenv/config";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, "..");
const SEED_DIR = path.join(BACKEND, "seed", "courses");
const SEED_LECTURES = path.join(SEED_DIR, "lectures");
const SEED_IMAGES = path.join(SEED_DIR, "images");
const UPLOAD_ROOT = path.resolve(process.env.UPLOADS_DIR ?? path.join(BACKEND, "data/uploads"));
const LECTURE_DIR = path.join(UPLOAD_ROOT, "course-lectures");
const AUTHOR_NICK = process.env.COURSES_SEED_AUTHOR ?? "enoobis";
const SEED_IMAGE_NAME = /^[0-9a-f]{40}\.[a-z0-9]+$/;

const CAT_CODE = {
  ai: "MK-AI",
  "ассемблер": "MK-ASSEMBLE",
  c: "MK-C",
  "общее": "MK-COMMON",
  "c++": "MK-CPP",
  dart: "MK-DART",
  "f#": "MK-F",
  go: "MK-GO",
  "хостинг": "MK-HOSTING",
  java: "MK-JAVA",
  javascript: "MK-JS",
  kotlin: "MK-KOTLIN",
  nosql: "MK-NOSQL",
  "операционные системы": "MK-OS",
  php: "MK-PHP",
  python: "MK-PYTHON",
  rust: "MK-RUST",
  "c#": "MK-SHARP",
  sql: "MK-SQL",
  swift: "MK-SWIFT",
  "visual basic": "MK-VISUALBA",
  "веб": "MK-WEB",
};

function readSeed() {
  if (!fs.existsSync(SEED_LECTURES)) {
    console.error(`нет seed: ${SEED_LECTURES}`);
    process.exit(1);
  }
  return fs
    .readdirSync(SEED_LECTURES)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(SEED_LECTURES, f), "utf8")));
}

function bookTitle(title) {
  const t = String(title ?? "").trim();
  const cut = t.replace(/^руководство по (?:языку |фреймворку )?/i, "");
  return cut || t;
}

function mergedCode(category) {
  const cat = String(category ?? "").trim();
  if (CAT_CODE[cat]) return CAT_CODE[cat];
  const slug = cat
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase()
    .slice(0, 12);
  return slug ? `MK-${slug}` : "MK-MISC";
}

function isMainBook(code) {
  return /TUTOR/i.test(String(code ?? ""));
}

function mergeByLanguage(files) {
  const groups = new Map();
  for (const file of files) {
    const category = String(file.category ?? "").trim();
    if (!category) continue;
    const code = mergedCode(category);
    let g = groups.get(code);
    if (!g) {
      g = { code, title: category, category, books: [] };
      groups.set(code, g);
    }
    g.books.push(file);
  }
  const out = [];
  for (const g of groups.values()) {
    g.books.sort((a, b) => {
      const am = isMainBook(a.code) ? 0 : 1;
      const bm = isMainBook(b.code) ? 0 : 1;
      if (am !== bm) return am - bm;
      return String(a.title).localeCompare(String(b.title), "ru");
    });
    const lectures = [];
    for (const book of g.books) {
      const name = bookTitle(book.title);
      for (const lecture of book.lectures ?? []) {
        lectures.push({
          title: lecture.title,
          chapter: lecture.chapter ?? "",
          book: name,
          body: lecture.body,
        });
      }
    }
    if (!lectures.length) continue;
    out.push({
      code: g.code,
      title: g.title,
      category: g.category,
      description: g.books.map((b) => bookTitle(b.title)).join(" · "),
      lectures,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

function syncImages(usedNames) {
  fs.mkdirSync(LECTURE_DIR, { recursive: true });
  let copied = 0;
  for (const name of fs.existsSync(SEED_IMAGES) ? fs.readdirSync(SEED_IMAGES) : []) {
    if (!usedNames.has(name)) continue;
    const to = path.join(LECTURE_DIR, name);
    if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(path.join(SEED_IMAGES, name)).size)
      continue;
    fs.copyFileSync(path.join(SEED_IMAGES, name), to);
    copied += 1;
  }
  let removed = 0;
  for (const name of fs.readdirSync(LECTURE_DIR)) {
    if (usedNames.has(name) || !SEED_IMAGE_NAME.test(name)) continue;
    fs.unlinkSync(path.join(LECTURE_DIR, name));
    removed += 1;
  }
  return { copied, removed };
}

function collectImages(body, used) {
  const re = /\/uploads\/course-lectures\/([^/\s)]+)/g;
  let m;
  while ((m = re.exec(body))) used.add(m[1]);
}

function deleteCourse(run, all, courseId) {
  const lectures = all("SELECT id FROM course_lectures WHERE course_id = ?", courseId);
  for (const l of lectures) {
    run("DELETE FROM course_lecture_attachments WHERE lecture_id = ?", l.id);
  }
  run(
    "DELETE FROM course_submission_attachments WHERE submission_id IN (SELECT s.id FROM course_assignment_submissions s JOIN course_assignments a ON a.id = s.assignment_id WHERE a.course_id = ?)",
    courseId,
  );
  run(
    "DELETE FROM course_assignment_submissions WHERE assignment_id IN (SELECT id FROM course_assignments WHERE course_id = ?)",
    courseId,
  );
  run("DELETE FROM course_assignments WHERE course_id = ?", courseId);
  run("DELETE FROM course_lectures WHERE course_id = ?", courseId);
  run(
    "DELETE FROM course_stream_comments WHERE post_id IN (SELECT id FROM course_stream_posts WHERE course_id = ?)",
    courseId,
  );
  run("DELETE FROM course_stream_posts WHERE course_id = ?", courseId);
  run("DELETE FROM course_students WHERE course_id = ?", courseId);
  run("DELETE FROM course_co_teachers WHERE course_id = ?", courseId);
  run("DELETE FROM user_favorite_courses WHERE course_id = ?", courseId);
  try {
    run("DELETE FROM ai_chat_messages WHERE course_id = ?", courseId);
  } catch {
    /* table may be missing in old db */
  }
  run("DELETE FROM courses WHERE id = ?", courseId);
}

async function main() {
  const courses = mergeByLanguage(readSeed());
  const { get, run, all, nowIso, db } = await import("../src/db.js");
  const author =
    get("SELECT id FROM users WHERE nickname = ?", AUTHOR_NICK) ||
    get("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
  if (!author) {
    console.error(`нет пользователя ${AUTHOR_NICK} и админа в базе`);
    process.exit(1);
  }

  const now = nowIso();
  const usedImages = new Set();
  let lectureCount = 0;
  let updated = 0;
  let created = 0;
  let removed = 0;
  const keepCodes = new Set(courses.map((c) => c.code));

  const apply = db.transaction(() => {
    for (const course of courses) {
      const existing = get("SELECT id FROM courses WHERE course_code = ?", course.code);
      const courseId = existing?.id ?? randomUUID();
      if (existing) {
        run(
          "UPDATE courses SET title = ?, category = ?, description = ? WHERE id = ?",
          course.title,
          course.category ?? "",
          course.description ?? "",
          courseId,
        );
        updated += 1;
      } else {
        run(
          `INSERT INTO courses (id, teacher_id, title, description, is_open, created_at, course_code, category)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
          courseId,
          author.id,
          course.title,
          course.description ?? "",
          now,
          course.code,
          course.category ?? "",
        );
        created += 1;
      }

      const old = all(
        "SELECT id FROM course_lectures WHERE course_id = ? ORDER BY position, created_at, rowid",
        courseId,
      );
      course.lectures.forEach((lecture, position) => {
        collectImages(lecture.body, usedImages);
        lectureCount += 1;
        const prev = old[position];
        if (prev) {
          run(
            `UPDATE course_lectures
             SET title = ?, body_text = ?, chapter = ?, book = ?, position = ?
             WHERE id = ?`,
            lecture.title,
            lecture.body,
            lecture.chapter ?? "",
            lecture.book ?? "",
            position,
            prev.id,
          );
        } else {
          run(
            `INSERT INTO course_lectures (id, course_id, author_id, title, body_text, video_url, created_at, position, chapter, book)
             VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?)`,
            randomUUID(),
            courseId,
            author.id,
            lecture.title,
            lecture.body,
            now,
            position,
            lecture.chapter ?? "",
            lecture.book ?? "",
          );
        }
      });
      for (const extra of old.slice(course.lectures.length)) {
        run("DELETE FROM course_lecture_attachments WHERE lecture_id = ?", extra.id);
        run("DELETE FROM course_lectures WHERE id = ?", extra.id);
      }
    }

    const stale = all(
      "SELECT id, course_code FROM courses WHERE course_code LIKE 'MK-%'",
    );
    for (const row of stale) {
      if (keepCodes.has(row.course_code)) continue;
      deleteCourse(run, all, row.id);
      removed += 1;
    }
  });
  apply();

  const images = syncImages(usedImages);
  console.log(
    `языков новых: ${created}, обновлено: ${updated}, старых курсов убрано: ${removed}, лекций: ${lectureCount}, картинок скопировано: ${images.copied}, удалено: ${images.removed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
