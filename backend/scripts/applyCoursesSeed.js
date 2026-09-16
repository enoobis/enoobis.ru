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

async function main() {
  const courses = readSeed();
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

  const apply = db.transaction(() => {
    for (const course of courses) {
      const existing = get("SELECT id FROM courses WHERE course_code = ?", course.code);
      const courseId = existing?.id ?? randomUUID();
      if (existing) {
        run(
          "UPDATE courses SET title = ?, category = ? WHERE id = ?",
          course.title,
          course.category ?? "",
          courseId,
        );
        updated += 1;
      } else {
        run(
          `INSERT INTO courses (id, teacher_id, title, description, is_open, created_at, course_code, category)
           VALUES (?, ?, ?, '', 1, ?, ?, ?)`,
          courseId,
          author.id,
          course.title,
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
             SET title = ?, body_text = ?, chapter = ?, position = ?
             WHERE id = ?`,
            lecture.title,
            lecture.body,
            lecture.chapter ?? "",
            position,
            prev.id,
          );
        } else {
          run(
            `INSERT INTO course_lectures (id, course_id, author_id, title, body_text, video_url, created_at, position, chapter)
             VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)`,
            randomUUID(),
            courseId,
            author.id,
            lecture.title,
            lecture.body,
            now,
            position,
            lecture.chapter ?? "",
          );
        }
      });
      for (const extra of old.slice(course.lectures.length)) {
        run("DELETE FROM course_lecture_attachments WHERE lecture_id = ?", extra.id);
        run("DELETE FROM course_lectures WHERE id = ?", extra.id);
      }
    }
  });
  apply();

  const images = syncImages(usedImages);
  console.log(
    `курсов новых: ${created}, обновлено: ${updated}, лекций: ${lectureCount}, картинок скопировано: ${images.copied}, удалено: ${images.removed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
