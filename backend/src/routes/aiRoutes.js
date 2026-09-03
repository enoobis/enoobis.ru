import express from "express";
import { v4 as uuidv4 } from "uuid";
import { all, get, run } from "../db.js";
import { authRequired } from "../auth.js";
import { rateLimit } from "../utils/security.js";
import { isStaffRole } from "../utils/roles.js";
import { geminiEnabled, geminiGenerate } from "../utils/gemini.js";

const router = express.Router();

const CHAT_DAILY_LIMIT = Number(process.env.AI_CHAT_DAILY_LIMIT ?? 40);

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY = 8;
/* сколько текста лекции отдаём модели как контекст */
const MAX_CONTEXT_CHARS = 4000;

/** неделя истории на пользователя и курс, дальше чистим */
const CHAT_TTL_DAYS = 7;

const HUMAN_STYLE = [
  "пиши как живой человек и практик, а не как ассистент.",
  "никаких длинных тире, эмодзи, канцелярита и англицизмов без нужды.",
  "не начинай с «отличный вопрос», не хвали вопрос, не извиняйся и не пересказывай его.",
  "не пиши воду и списки ради списков, лучше нормальный связный абзац.",
].join(" ");

const TUTOR_SYSTEM = [
  "ты тьютор курса на enoobis: учишь понимать материал, а не делаешь работу за студента.",
  "держись как преподаватель: спокойно, уверенно, по делу.",
  "ученик читает конкретную тему, её текст дан ниже в контексте.",
  "по умолчанию считай, что вопрос про открытую тему, даже если ученик её не назвал.",
  "сначала ищи ответ в тексте темы и объясняй своими словами, на её примерах и терминах.",
  "если в теме ответа нет, скажи это одной фразой и ответь по своим знаниям.",
  "объясняй от простого к сложному, короткими абзацами, с примером там, где он помогает.",
  HUMAN_STYLE,
  "не выдумывай оценки, сроки и факты о курсе.",
  "жёстко: не решай задания, контрольные, тесты и дз за ученика.",
  "не пиши готовый ответ, финальный код, числа или формулировку, которую можно сдать как работу.",
  "если просят «реши», «напиши код», «сделай за меня», «дай ответ на задание» — откажи одной фразой и помоги понять ход: наводящий вопрос, идея, похожий пример с другими данными.",
  "можно разобрать понятие, ошибку в рассуждении и следующий шаг. нельзя — готовое решение текущей задачи.",
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
    "SELECT title FROM course_assignments WHERE lecture_id = ?",
    lecture.id,
  );
  if (tasks.length) {
    lines.push(
      `названия заданий темы (тексты и ответы не даны, решать их нельзя): ${tasks.map((t) => t.title).join("; ")}`,
    );
  }
  return lines.join("\n");
}

router.get("/ai/status", authRequired, (req, res) => {
  return res.json({
    enabled: geminiEnabled(),
    can_generate: false,
    chat_limit: CHAT_DAILY_LIMIT,
    chat_used: usageCount(req.user.id, "chat"),
    generate_limit: 0,
    generate_used: 0,
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
        maxTokens: 640,
        temperature: 0.4,
        cheap: true,
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

function generateGone(_req, res) {
  return res.status(410).json({ error: "generate_disabled" });
}

router.post("/ai/course-outline", authRequired, generateGone);
router.post("/ai/lecture-draft", authRequired, generateGone);

export default router;
