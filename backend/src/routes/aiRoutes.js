import express from "express";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { all, get, run } from "../db.js";
import { authRequired } from "../auth.js";
import { rateLimit } from "../utils/security.js";
import { isStaffRole } from "../utils/roles.js";
import { UPLOAD_ROOT } from "../utils/uploadSafe.js";
import { optimizeUploadedFile } from "../utils/imageOptimize.js";
import {
  geminiEnabled,
  geminiGenerate,
  geminiGenerateImage,
  parseJsonLoose,
} from "../utils/gemini.js";

const router = express.Router();

const IMAGE_DIR = path.join(UPLOAD_ROOT, "course-lectures");
fs.mkdirSync(IMAGE_DIR, { recursive: true });

const CHAT_DAILY_LIMIT = Number(process.env.AI_CHAT_DAILY_LIMIT ?? 40);
const GENERATE_DAILY_LIMIT = Number(process.env.AI_GENERATE_DAILY_LIMIT ?? 150);

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY = 12;
/* сколько текста лекции отдаём модели как контекст */
const MAX_CONTEXT_CHARS = 8000;

/** неделя истории на пользователя и курс, дальше чистим */
const CHAT_TTL_DAYS = 7;

const HUMAN_STYLE = [
  "пиши как живой человек и практик, а не как ассистент.",
  "никаких длинных тире, эмодзи, канцелярита и англицизмов без нужды.",
  "не начинай с «отличный вопрос», не хвали вопрос, не извиняйся и не пересказывай его.",
  "не пиши воду и списки ради списков, лучше нормальный связный абзац.",
].join(" ");

const TUTOR_SYSTEM = [
  "ты ведёшь этот курс на платформе enoobis и объясняешь материал студенту.",
  "держись как преподаватель, который знает предмет на практике: спокойно, уверенно, по делу.",
  "ученик читает конкретную тему, её полный текст дан ниже в контексте.",
  "по умолчанию считай, что вопрос про открытую тему, даже если ученик её не назвал.",
  "сначала ищи ответ в тексте темы и объясняй своими словами, на его примерах и терминах.",
  "если в теме ответа нет, скажи это одной фразой и ответь по своим знаниям.",
  "объясняй так, чтобы студент понял: от простого к сложному, короткими абзацами, с примером там, где он помогает.",
  HUMAN_STYLE,
  "не выдумывай оценки, сроки и факты о курсе.",
  "готовые решения домашних заданий не выдавай, объясняй ход и подсказывай.",
].join(" ");

function today() {
  return new Date().toISOString().slice(0, 10);
}

function usageCount(userId, kind) {
  const row = get(
    "SELECT count FROM ai_usage WHERE user_id = ? AND day = ? AND kind = ?",
    userId,
    today(),
    kind,
  );
  return row?.count ?? 0;
}

function bumpUsage(userId, kind) {
  run(
    `INSERT INTO ai_usage (user_id, day, kind, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(user_id, day, kind) DO UPDATE SET count = count + 1`,
    userId,
    today(),
    kind,
  );
}

function limitFor(kind) {
  return kind === "chat" ? CHAT_DAILY_LIMIT : GENERATE_DAILY_LIMIT;
}

function courseAccess(courseId, user) {
  const course = get("SELECT * FROM courses WHERE id = ?", courseId);
  if (!course) return { error: 404 };
  const isOwner = course.teacher_id === user.id;
  const isCo = !!get(
    "SELECT 1 as v FROM course_co_teachers WHERE course_id = ? AND user_id = ?",
    courseId,
    user.id,
  );
  const isStudent = !!get(
    "SELECT 1 as v FROM course_students WHERE course_id = ? AND student_id = ?",
    courseId,
    user.id,
  );
  const isTeacher = isOwner || isCo || user.role === "admin";
  if (!isTeacher && !isStudent && !course.is_open) return { error: 403 };
  return { course, isTeacher };
}

function sendAiError(res, e, user) {
  const code = e?.message ?? "ai_failed";
  const status = code === "ai_disabled" ? 503 : code === "ai_rate_limited" ? 429 : 502;
  const body = { error: code };
  /* точную причину от google видит только персонал */
  if (e?.detail && isStaffRole(user?.role)) body.detail = String(e.detail);
  return res.status(status).json(body);
}

function lectureContext(course, lectureId) {
  const lines = [`курс: ${course.title}`];
  if (course.description) lines.push(`описание курса: ${course.description}`);

  const allTopics = all(
    "SELECT title FROM course_lectures WHERE course_id = ? ORDER BY created_at",
    course.id,
  );
  if (allTopics.length) {
    lines.push(`все темы курса: ${allTopics.map((t) => t.title).join("; ")}`);
  }
  if (!lectureId) return lines.join("\n");

  const lecture = get(
    "SELECT * FROM course_lectures WHERE id = ? AND course_id = ?",
    lectureId,
    course.id,
  );
  if (!lecture) return lines.join("\n");

  lines.push(`ученик сейчас читает тему: ${lecture.title}`);
  if (lecture.body_text) {
    lines.push("полный текст открытой темы:");
    lines.push(String(lecture.body_text).slice(0, MAX_CONTEXT_CHARS));
  }
  const files = all(
    "SELECT file_name FROM course_lecture_attachments WHERE lecture_id = ?",
    lecture.id,
  );
  if (files.length) {
    lines.push(`вложения темы: ${files.map((f) => f.file_name).join(", ")}`);
  }
  const tasks = all(
    "SELECT title, description FROM course_assignments WHERE lecture_id = ?",
    lecture.id,
  );
  if (tasks.length) {
    lines.push(
      `задания темы: ${tasks.map((t) => `${t.title} — ${t.description ?? ""}`.trim()).join("; ")}`,
    );
  }
  return lines.join("\n");
}

router.get("/ai/status", authRequired, (req, res) => {
  const staff = isStaffRole(req.user.role);
  return res.json({
    enabled: geminiEnabled(),
    can_generate: staff,
    chat_limit: CHAT_DAILY_LIMIT,
    chat_used: usageCount(req.user.id, "chat"),
    generate_limit: staff ? GENERATE_DAILY_LIMIT : 0,
    generate_used: staff ? usageCount(req.user.id, "generate") : 0,
  });
});

function purgeOldChat() {
  const edge = new Date(Date.now() - CHAT_TTL_DAYS * 86_400_000).toISOString();
  run("DELETE FROM ai_chat_messages WHERE created_at < ?", edge);
}

function chatHistory(userId, courseId, limit) {
  const rows = all(
    `SELECT role, text, created_at FROM ai_chat_messages
     WHERE user_id = ? AND course_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    userId,
    courseId,
    limit,
  );
  return rows.reverse();
}

function saveChatMessage(userId, courseId, role, text) {
  run(
    "INSERT INTO ai_chat_messages (id, user_id, course_id, role, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    uuidv4(),
    userId,
    courseId,
    role,
    text,
    new Date().toISOString(),
  );
}

router.get("/ai/chat/:courseId", authRequired, (req, res) => {
  const access = courseAccess(req.params.courseId, req.user);
  if (access.error) return res.status(access.error).json({ error: "no access" });
  purgeOldChat();
  return res.json({ messages: chatHistory(req.user.id, req.params.courseId, 100) });
});

router.delete("/ai/chat/:courseId", authRequired, (req, res) => {
  run(
    "DELETE FROM ai_chat_messages WHERE user_id = ? AND course_id = ?",
    req.user.id,
    req.params.courseId,
  );
  return res.json({ ok: true });
});

router.post(
  "/ai/chat",
  authRequired,
  rateLimit({ windowMs: 60_000, max: 12, keyPrefix: "ai-chat" }),
  async (req, res) => {
    if (!geminiEnabled()) return res.status(503).json({ error: "ai_disabled" });

    const courseId = String(req.body?.course_id ?? "");
    const access = courseAccess(courseId, req.user);
    if (access.error) return res.status(access.error).json({ error: "no access" });

    const question = String(req.body?.message ?? "").slice(0, MAX_MESSAGE_CHARS).trim();
    if (!question) return res.status(400).json({ error: "empty" });

    const used = usageCount(req.user.id, "chat");
    if (used >= CHAT_DAILY_LIMIT) {
      return res.status(429).json({ error: "daily_limit", limit: CHAT_DAILY_LIMIT });
    }

    purgeOldChat();
    const messages = [
      ...chatHistory(req.user.id, courseId, MAX_HISTORY).map((m) => ({
        role: m.role === "model" ? "model" : "user",
        text: String(m.text).slice(0, MAX_MESSAGE_CHARS),
      })),
      { role: "user", text: question },
    ];

    const context = lectureContext(access.course, String(req.body?.lecture_id ?? ""));
    try {
      const reply = await geminiGenerate({
        system: `${TUTOR_SYSTEM}\n\nконтекст:\n${context}`,
        messages,
        maxTokens: 1200,
      });
      bumpUsage(req.user.id, "chat");
      saveChatMessage(req.user.id, courseId, "user", question);
      saveChatMessage(req.user.id, courseId, "model", reply);
      return res.json({
        reply,
        used: used + 1,
        limit: CHAT_DAILY_LIMIT,
      });
    } catch (e) {
      return sendAiError(res, e, req.user);
    }
  },
);

function staffOnly(req, res, next) {
  if (!isStaffRole(req.user.role)) return res.status(403).json({ error: "forbidden" });
  next();
}

async function generateGuard(req, res) {
  if (!geminiEnabled()) {
    res.status(503).json({ error: "ai_disabled" });
    return false;
  }
  const used = usageCount(req.user.id, "generate");
  if (used >= GENERATE_DAILY_LIMIT) {
    res.status(429).json({ error: "daily_limit", limit: GENERATE_DAILY_LIMIT });
    return false;
  }
  return true;
}

router.post(
  "/ai/course-outline",
  authRequired,
  staffOnly,
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "ai-outline" }),
  async (req, res) => {
    if (!(await generateGuard(req, res))) return;

    const title = String(req.body?.title ?? "").trim().slice(0, 200);
    if (!title) return res.status(400).json({ error: "title_required" });
    const description = String(req.body?.description ?? "").trim().slice(0, 1000);
    const count = Math.min(Math.max(Number(req.body?.count ?? 8), 3), 20);

    const prompt = [
      `составь план курса «${title}» из ${count} тем.`,
      description ? `описание курса: ${description}` : "",
      "верни строго json: { \"topics\": [{ \"title\": string, \"summary\": string }] }.",
      "title — короткое название темы строчными буквами, summary — до 12 слов о содержании.",
      "порядок тем — от простого к сложному, без нумерации в тексте.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const raw = await geminiGenerate({
        system: `ты методист. ${HUMAN_STYLE} отвечаешь только валидным json на русском.`,
        messages: [{ role: "user", text: prompt }],
        maxTokens: Math.min(1000 + count * 180, 8000),
        json: true,
      });
      const parsed = parseJsonLoose(raw);
      const topics = Array.isArray(parsed?.topics) ? parsed.topics : [];
      bumpUsage(req.user.id, "generate");
      return res.json({
        topics: topics
          .map((t) => ({
            title: String(t?.title ?? "").trim().slice(0, 200),
            summary: String(t?.summary ?? "").trim().slice(0, 500),
          }))
          .filter((t) => t.title),
      });
    } catch (e) {
      if (e instanceof SyntaxError) return res.status(502).json({ error: "ai_bad_json" });
      return sendAiError(res, e, req.user);
    }
  },
);

router.post(
  "/ai/lecture-draft",
  authRequired,
  staffOnly,
  // генерация курса идёт темами подряд, поэтому лимит на минуту щедрый
  rateLimit({ windowMs: 60_000, max: 40, keyPrefix: "ai-draft" }),
  async (req, res) => {
    if (!(await generateGuard(req, res))) return;

    const topic = String(req.body?.topic ?? "").trim().slice(0, 300);
    if (!topic) return res.status(400).json({ error: "topic_required" });
    const courseTitle = String(req.body?.course_title ?? "").trim().slice(0, 200);
    const notes = String(req.body?.notes ?? "").trim().slice(0, 1000);

    const prompt = [
      `напиши учебную тему «${topic}».`,
      courseTitle ? `курс: ${courseTitle}` : "",
      notes ? `пожелания преподавателя: ${notes}` : "",
      'верни строго json: { "body": string, "task": { "title": string, "description": string, "max_points": number } }.',
      "body — markdown темы: короткое вступление, основная часть с подзаголовками, пример, короткий итог. 400-700 слов, без картинок и html.",
      "задание в body не включай — оно идёт отдельным полем task.",
      "task.title — короткое название строчными буквами, task.description — что именно нужно сделать, task.max_points — целое от 10 до 100.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const raw = await geminiGenerate({
        system: `ты преподаватель-практик, пишешь учебный текст на русском. ${HUMAN_STYLE} отвечаешь только валидным json.`,
        messages: [{ role: "user", text: prompt }],
        maxTokens: 4000,
        json: true,
      });
      const parsed = parseJsonLoose(raw);
      const body = String(parsed?.body ?? "").trim();
      if (!body) return res.status(502).json({ error: "ai_empty" });
      const rawTask = parsed?.task;
      const taskTitle = String(rawTask?.title ?? "").trim().slice(0, 200);
      const task = taskTitle
        ? {
            title: taskTitle,
            description: String(rawTask?.description ?? "").trim().slice(0, 2000),
            max_points: Math.min(Math.max(Number(rawTask?.max_points) || 100, 10), 100),
          }
        : null;
      bumpUsage(req.user.id, "generate");
      return res.json({ title: topic, body, task });
    } catch (e) {
      if (e instanceof SyntaxError) return res.status(502).json({ error: "ai_bad_json" });
      return sendAiError(res, e, req.user);
    }
  },
);

router.post(
  "/ai/image",
  authRequired,
  staffOnly,
  rateLimit({ windowMs: 60_000, max: 40, keyPrefix: "ai-image" }),
  async (req, res) => {
    if (!(await generateGuard(req, res))) return;

    const topic = String(req.body?.topic ?? "").trim().slice(0, 300);
    if (!topic) return res.status(400).json({ error: "topic_required" });

    const prompt = [
      `учебная иллюстрация к теме «${topic}».`,
      "строго чёрно-белая графика: белый фон, чёрные линии, без цвета и без градиентов.",
      "чистая схема или минималистичный рисунок, поясняющий суть темы.",
      "без текста и подписей на картинке.",
    ].join(" ");

    try {
      const { buffer, mime } = await geminiGenerateImage(prompt);
      if (buffer.length > 8 * 1024 * 1024) return res.status(502).json({ error: "ai_failed" });
      const ext = mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : ".png";
      const filename = `ai-${uuidv4().replace(/-/g, "")}${ext}`;
      const filePath = path.join(IMAGE_DIR, filename);
      fs.writeFileSync(filePath, buffer);

      let finalName = filename;
      const optimized = await optimizeUploadedFile(filePath, "lecture");
      if (optimized.ok) finalName = optimized.filename;

      bumpUsage(req.user.id, "generate");
      return res.json({ url: `/uploads/course-lectures/${finalName}` });
    } catch (e) {
      return sendAiError(res, e, req.user);
    }
  },
);

export default router;
