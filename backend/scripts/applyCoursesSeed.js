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
const CODE_PREFIX = "MK-";
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

  const apply = db.transaction(() => {
    for (const c of all("SELECT id FROM courses WHERE course_code LIKE ?", `${CODE_PREFIX}%`)) {
      for (const l of all("SELECT id FROM course_lectures WHERE course_id = ?", c.id)) {
        run("DELETE FROM course_lecture_attachments WHERE lecture_id = ?", l.id);
      }
      run("DELETE FROM course_lectures WHERE course_id = ?", c.id);
      run("DELETE FROM course_students WHERE course_id = ?", c.id);
      run("DELETE FROM course_co_teachers WHERE course_id = ?", c.id);
      run("DELETE FROM user_favorite_courses WHERE course_id = ?", c.id);
      run("DELETE FROM courses WHERE id = ?", c.id);
    }

    for (const course of courses) {
      const courseId = randomUUID();
      run(
        `INSERT INTO courses (id, teacher_id, title, description, is_open, created_at, course_code)
         VALUES (?, ?, ?, '', 1, ?, ?)`,
        courseId,
        author.id,
        course.title,
        now,
        course.code,
      );
      course.lectures.forEach((lecture, position) => {
        run(
          `INSERT INTO course_lectures (id, course_id, author_id, title, body_text, video_url, created_at, position)
           VALUES (?, ?, ?, ?, ?, '', ?, ?)`,
          randomUUID(),
          courseId,
          author.id,
          lecture.title,
          lecture.body,
          now,
          position,
        );
        const re = /\/uploads\/course-lectures\/([^/\s)]+)/g;
        let m;
        while ((m = re.exec(lecture.body))) usedImages.add(m[1]);
        lectureCount += 1;
      });
    }
  });
  apply();

  const images = syncImages(usedImages);
  console.log(
    `курсов: ${courses.length}, лекций: ${lectureCount}, картинок скопировано: ${images.copied}, удалено: ${images.removed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
