import express from "express";
import { all, get, run } from "../db.js";
import { authRequired } from "../auth.js";
import { rateLimit } from "../utils/security.js";
import { isStaffRole } from "../utils/roles.js";
import { geminiEnabled, geminiGenerate, parseJsonLoose } from "../utils/gemini.js";

const router = express.Router();

const CHAT_DAILY_LIMIT = Number(process.env.AI_CHAT_DAILY_LIMIT ?? 40);
const GENERATE_DAILY_LIMIT = Number(process.env.AI_GENERATE_DAILY_LIMIT ?? 25);

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY = 12;
/* сколько текста лекции отдаём модели как контекст */
const MAX_CONTEXT_CHARS = 8000;

const TUTOR_SYSTEM = [
  "ты — преподаватель-ассистент внутри курса на платформе enoobis.",
  "отвечай на русском, кратко и по делу, без воды и без извинений.",
  "если вопрос про материал темы — опирайся на контекст темы.",
  "если в контексте нет ответа — скажи об этом прямо и ответь по своим знаниям.",
  "не выдумывай оценки, сроки и факты о курсе.",
  "готовые решения домашних заданий не выдавай — объясняй ход и подсказывай.",
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

function aiErrorStatus(message) {
  if (message === "ai_disabled") return 503;
  if (message === "ai_rate_limited") return 429;
  return 502;
}

function lectureContext(course, lectureId) {
  const lines = [`курс: ${course.title}`];
  if (course.description) lines.push(`описание курса: ${course.description}`);
  if (!lectureId) return lines.join("\n");

  const lecture = get(
    "SELECT * FROM course_lectures WHERE id = ? AND course_id = ?",
    lectureId,
    course.id,
  );
  if (!lecture) return lines.join("\n");

  lines.push(`тема: ${lecture.title}`);
  if (lecture.body_text) {
    lines.push("текст темы:");
    lines.push(String(lecture.body_text).slice(0, MAX_CONTEXT_CHARS));
  }
  const files = all(
    "SELECT file_name FROM course_lecture_attachments WHERE lecture_id = ?",
    lecture.id,
  );
  if (files.length) {
    lines.push(`вложения: ${files.map((f) => f.file_name).join(", ")}`);
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

router.post(
  "/ai/chat",
  authRequired,
  rateLimit({ windowMs: 60_000, max: 12, keyPrefix: "ai-chat" }),
  async (req, res) => {
    if (!geminiEnabled()) return res.status(503).json({ error: "ai_disabled" });

    const access = courseAccess(String(req.body?.course_id ?? ""), req.user);
    if (access.error) return res.status(access.error).json({ error: "no access" });

    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const messages = raw
      .slice(-MAX_HISTORY)
      .map((m) => ({
        role: m?.role === "model" ? "model" : "user",
        text: String(m?.text ?? "").slice(0, MAX_MESSAGE_CHARS),
      }))
      .filter((m) => m.text.trim());
    if (!messages.length) return res.status(400).json({ error: "empty" });

    const used = usageCount(req.user.id, "chat");
    if (used >= CHAT_DAILY_LIMIT) {
      return res.status(429).json({ error: "daily_limit", limit: CHAT_DAILY_LIMIT });
    }

    const context = lectureContext(access.course, String(req.body?.lecture_id ?? ""));
    try {
      const reply = await geminiGenerate({
        system: `${TUTOR_SYSTEM}\n\nконтекст:\n${context}`,
        messages,
        maxTokens: 1200,
      });
      bumpUsage(req.user.id, "chat");
      return res.json({
        reply,
        used: used + 1,
        limit: CHAT_DAILY_LIMIT,
      });
    } catch (e) {
      const message = e?.message ?? "ai_failed";
      return res.status(aiErrorStatus(message)).json({ error: message });
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
  rateLimit({ windowMs: 60_000, max: 6, keyPrefix: "ai-outline" }),
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
      "title — короткое название темы строчными буквами, summary — одно предложение о содержании.",
      "порядок тем — от простого к сложному, без нумерации в тексте.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const raw = await geminiGenerate({
        system: "ты методист. отвечаешь только валидным json на русском.",
        messages: [{ role: "user", text: prompt }],
        maxTokens: 2000,
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
      const message = e?.message ?? "ai_failed";
      if (message.startsWith("Unexpected") || e instanceof SyntaxError) {
        return res.status(502).json({ error: "ai_bad_json" });
      }
      return res.status(aiErrorStatus(message)).json({ error: message });
    }
  },
);

router.post(
  "/ai/lecture-draft",
  authRequired,
  staffOnly,
  rateLimit({ windowMs: 60_000, max: 6, keyPrefix: "ai-draft" }),
  async (req, res) => {
    if (!(await generateGuard(req, res))) return;

    const topic = String(req.body?.topic ?? "").trim().slice(0, 300);
    if (!topic) return res.status(400).json({ error: "topic_required" });
    const courseTitle = String(req.body?.course_title ?? "").trim().slice(0, 200);
    const notes = String(req.body?.notes ?? "").trim().slice(0, 1000);

    const prompt = [
      `напиши текст учебной темы «${topic}».`,
      courseTitle ? `курс: ${courseTitle}` : "",
      notes ? `пожелания преподавателя: ${notes}` : "",
      "структура: короткое вступление, основная часть с подзаголовками, пример, короткий итог.",
      "markdown, без картинок и без html. 400-700 слов.",
      "в конце добавь блок «задание» — одно практическое задание по теме.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const body = await geminiGenerate({
        system: "ты преподаватель. пишешь ясно, на русском, без воды.",
        messages: [{ role: "user", text: prompt }],
        maxTokens: 2600,
      });
      bumpUsage(req.user.id, "generate");
      return res.json({ title: topic, body });
    } catch (e) {
      const message = e?.message ?? "ai_failed";
      return res.status(aiErrorStatus(message)).json({ error: message });
    }
  },
);

export default router;
