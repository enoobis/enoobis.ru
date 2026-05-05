import express from "express";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";

const router = express.Router();

function generateCourseCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 8; i++) {
    let code = "";
    for (let j = 0; j < 6; j++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!get("SELECT 1 as v FROM courses WHERE course_code = ?", code)) return code;
  }
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function courseToDto(row, viewerId) {
  if (!row) return null;
  const teacher = get("SELECT nickname FROM users WHERE id = ?", row.teacher_id);
  const enrolled = viewerId
    ? !!get(
        "SELECT 1 as v FROM course_students WHERE course_id = ? AND student_id = ?",
        row.id,
        viewerId,
      ) || row.teacher_id === viewerId
    : false;
  return {
    id: row.id,
    course_code: row.course_code ?? "",
    title: row.title,
    description: row.description ?? "",
    is_open: !!row.is_open,
    teacher_id: row.teacher_id,
    teacher_nickname: teacher?.nickname ?? "",
    created_at: row.created_at,
    enrolled,
  };
}

router.get("/courses", authRequired, (req, res) => {
  const rows = all(
    `SELECT c.* FROM courses c
     WHERE c.is_open = 1
        OR c.teacher_id = ?
        OR EXISTS (SELECT 1 FROM course_students s WHERE s.course_id = c.id AND s.student_id = ?)
     ORDER BY c.created_at DESC`,
    req.user.id,
    req.user.id,
  );
  return res.json(rows.map((r) => courseToDto(r, req.user.id)));
});

router.post("/courses", authRequired, (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  const title = String(req.body?.title ?? "").trim();
  if (!title) return res.status(400).json({ error: "title required" });
  const id = uuidv4();
  const now = nowIso();
  const code = generateCourseCode();
  run(
    `INSERT INTO courses (id, teacher_id, title, description, is_open, created_at, course_code)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    req.user.id,
    title,
    String(req.body?.description ?? ""),
    req.body?.is_open === false ? 0 : 1,
    now,
    code,
  );
  return res.json(courseToDto(get("SELECT * FROM courses WHERE id = ?", id), req.user.id));
});

router.post("/courses/:id/enroll", authRequired, (req, res) => {
  const c = get("SELECT * FROM courses WHERE id = ?", req.params.id);
  if (!c) return res.status(404).json({ error: "not found" });
  if (!c.is_open) return res.status(403).json({ error: "course is closed" });
  run(
    "INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)",
    c.id,
    req.user.id,
  );
  return res.json({ ok: true });
});

router.delete("/courses/:id/enroll", authRequired, (req, res) => {
  run(
    "DELETE FROM course_students WHERE course_id = ? AND student_id = ?",
    req.params.id,
    req.user.id,
  );
  return res.json({ ok: true });
});

router.post("/courses/join-by-code", authRequired, (req, res) => {
  const code = String(req.body?.code ?? "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "code required" });
  const c = get("SELECT * FROM courses WHERE course_code = ?", code);
  if (!c) return res.status(404).json({ error: "course not found" });
  run(
    "INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)",
    c.id,
    req.user.id,
  );
  return res.json(courseToDto(c, req.user.id));
});

router.post("/courses/:id/students", authRequired, (req, res) => {
  const c = get("SELECT * FROM courses WHERE id = ?", req.params.id);
  if (!c) return res.status(404).json({ error: "not found" });
  if (c.teacher_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  const ids = Array.isArray(req.body?.student_ids) ? req.body.student_ids : [];
  run("DELETE FROM course_students WHERE course_id = ?", c.id);
  for (const sid of ids) {
    run(
      "INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)",
      c.id,
      String(sid),
    );
  }
  return res.json({ ok: true });
});

function membersFor(course) {
  const students = all(
    `SELECT u.id, u.nickname, u.role
     FROM course_students s JOIN users u ON u.id = s.student_id
     WHERE s.course_id = ?`,
    course.id,
  );
  const teacher = get("SELECT id, nickname, role FROM users WHERE id = ?", course.teacher_id);
  const list = teacher ? [teacher, ...students.filter((m) => m.id !== teacher.id)] : students;
  return list;
}

function attachmentsFor(lectureId) {
  return all(
    "SELECT id, file_name, url, created_at FROM course_lecture_attachments WHERE lecture_id = ? ORDER BY created_at",
    lectureId,
  );
}

function lecturesFor(course) {
  const rows = all(
    `SELECT l.id, l.course_id, l.author_id, u.nickname as author_nickname,
            l.title, l.body_text, l.video_url, l.created_at
     FROM course_lectures l JOIN users u ON u.id = l.author_id
     WHERE l.course_id = ?
     ORDER BY l.created_at`,
    course.id,
  );
  return rows.map((r) => ({ ...r, attachments: attachmentsFor(r.id) }));
}

function assignmentsFor(course, viewerId) {
  const rows = all(
    `SELECT a.id, a.course_id, a.author_id, u.nickname as author_nickname,
            a.title, a.description, a.due_at, a.max_points, a.created_at, a.lecture_id
     FROM course_assignments a JOIN users u ON u.id = a.author_id
     WHERE a.course_id = ?
     ORDER BY a.created_at`,
    course.id,
  );
  return rows.map((row) => {
    const my = viewerId
      ? get(
          `SELECT id, content, status, grade_points, teacher_comment, created_at, updated_at
           FROM course_assignment_submissions
           WHERE assignment_id = ? AND student_id = ?`,
          row.id,
          viewerId,
        )
      : null;
    return { ...row, my_submission: my ?? null };
  });
}

function streamFor(course) {
  const posts = all(
    `SELECT p.id, p.course_id, p.author_id, u.nickname as author_nickname, p.body, p.created_at
     FROM course_stream_posts p JOIN users u ON u.id = p.author_id
     WHERE p.course_id = ?
     ORDER BY p.created_at DESC`,
    course.id,
  );
  return posts.map((p) => ({
    ...p,
    comments: all(
      `SELECT c.id, c.post_id, c.course_id, c.author_id, u.nickname as author_nickname, c.body, c.created_at
       FROM course_stream_comments c JOIN users u ON u.id = c.author_id
       WHERE c.post_id = ?
       ORDER BY c.created_at`,
      p.id,
    ),
  }));
}

function ensureCourseAccess(courseId, user) {
  const course = get("SELECT * FROM courses WHERE id = ?", courseId);
  if (!course) return { error: 404 };
  const isTeacher = course.teacher_id === user.id;
  const isStudent = !!get(
    "SELECT 1 as v FROM course_students WHERE course_id = ? AND student_id = ?",
    courseId,
    user.id,
  );
  if (!isTeacher && !isStudent && !course.is_open && user.role !== "admin")
    return { error: 403 };
  return { course, isTeacher, isStudent };
}

router.get("/courses/:id/classroom", authRequired, (req, res) => {
  const access = ensureCourseAccess(req.params.id, req.user);
  if (access.error) return res.status(access.error).json({ error: "no access" });
  const { course, isTeacher } = access;
  return res.json({
    course: courseToDto(course, req.user.id),
    is_teacher: isTeacher,
    stream: streamFor(course),
    assignments: assignmentsFor(course, req.user.id),
    lectures: lecturesFor(course),
    members: membersFor(course),
  });
});

router.post("/courses/:id/stream", authRequired, (req, res) => {
  const access = ensureCourseAccess(req.params.id, req.user);
  if (access.error) return res.status(access.error).json({ error: "no access" });
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "empty post" });
  const id = uuidv4();
  const now = nowIso();
  run(
    "INSERT INTO course_stream_posts (id, course_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    id,
    access.course.id,
    req.user.id,
    body,
    now,
  );
  const post = get(
    `SELECT p.id, p.course_id, p.author_id, u.nickname as author_nickname, p.body, p.created_at
     FROM course_stream_posts p JOIN users u ON u.id = p.author_id
     WHERE p.id = ?`,
    id,
  );
  return res.json({ ...post, comments: [] });
});

router.post("/courses/:id/stream/:postId/comments", authRequired, (req, res) => {
  const access = ensureCourseAccess(req.params.id, req.user);
  if (access.error) return res.status(access.error).json({ error: "no access" });
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "empty comment" });
  const id = uuidv4();
  const now = nowIso();
  run(
    `INSERT INTO course_stream_comments (id, post_id, course_id, author_id, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    req.params.postId,
    access.course.id,
    req.user.id,
    body,
    now,
  );
  const c = get(
    `SELECT c.id, c.post_id, c.course_id, c.author_id, u.nickname as author_nickname, c.body, c.created_at
     FROM course_stream_comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`,
    id,
  );
  return res.json(c);
});

router.post("/courses/:id/assignments", authRequired, (req, res) => {
  const access = ensureCourseAccess(req.params.id, req.user);
  if (access.error) return res.status(access.error).json({ error: "no access" });
  if (!access.isTeacher && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  const id = uuidv4();
  const now = nowIso();
  run(
    `INSERT INTO course_assignments (id, course_id, author_id, title, description, due_at, max_points, created_at, lecture_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    access.course.id,
    req.user.id,
    String(req.body?.title ?? ""),
    String(req.body?.description ?? ""),
    String(req.body?.due_at ?? ""),
    Number(req.body?.max_points ?? 100) || 100,
    now,
    req.body?.lecture_id ?? null,
  );
  const row = get(
    `SELECT a.id, a.course_id, a.author_id, u.nickname as author_nickname,
            a.title, a.description, a.due_at, a.max_points, a.created_at, a.lecture_id
     FROM course_assignments a JOIN users u ON u.id = a.author_id WHERE a.id = ?`,
    id,
  );
  return res.json({ ...row, my_submission: null });
});

router.patch("/courses/:id/assignments/:aid", authRequired, (req, res) => {
  const access = ensureCourseAccess(req.params.id, req.user);
  if (access.error) return res.status(access.error).json({ error: "no access" });
  if (!access.isTeacher && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  const fields = ["title", "description", "due_at", "max_points"];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      run(`UPDATE course_assignments SET ${f} = ? WHERE id = ?`, req.body[f], req.params.aid);
    }
  }
  const row = get(
    `SELECT a.id, a.course_id, a.author_id, u.nickname as author_nickname,
            a.title, a.description, a.due_at, a.max_points, a.created_at, a.lecture_id
     FROM course_assignments a JOIN users u ON u.id = a.author_id WHERE a.id = ?`,
    req.params.aid,
  );
  const my = get(
    `SELECT id, content, status, grade_points, teacher_comment, created_at, updated_at
     FROM course_assignment_submissions WHERE assignment_id = ? AND student_id = ?`,
    req.params.aid,
    req.user.id,
  );
  return res.json({ ...row, my_submission: my ?? null });
});

router.post("/courses/:id/assignments/:aid/submit", authRequired, (req, res) => {
  const access = ensureCourseAccess(req.params.id, req.user);
  if (access.error) return res.status(access.error).json({ error: "no access" });
  const content = String(req.body?.content ?? "");
  const now = nowIso();
  const existing = get(
    "SELECT id FROM course_assignment_submissions WHERE assignment_id = ? AND student_id = ?",
    req.params.aid,
    req.user.id,
  );
  if (existing) {
    run(
      "UPDATE course_assignment_submissions SET content = ?, status = 'submitted', updated_at = ? WHERE id = ?",
      content,
      now,
      existing.id,
    );
  } else {
    run(
      `INSERT INTO course_assignment_submissions
        (id, assignment_id, student_id, content, status, grade_points, teacher_comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'submitted', NULL, '', ?, ?)`,
      uuidv4(),
      req.params.aid,
      req.user.id,
      content,
      now,
      now,
    );
  }
  const my = get(
    `SELECT id, content, status, grade_points, teacher_comment, created_at, updated_at
     FROM course_assignment_submissions WHERE assignment_id = ? AND student_id = ?`,
    req.params.aid,
    req.user.id,
  );
  return res.json(my);
});

router.get("/courses/:id/assignments/:aid/submissions", authRequired, (req, res) => {
  const access = ensureCourseAccess(req.params.id, req.user);
  if (access.error) return res.status(access.error).json({ error: "no access" });
  if (!access.isTeacher && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  const subs = all(
    `SELECT s.id, s.assignment_id, s.student_id, u.nickname as student_nickname,
            s.content, s.status, s.grade_points, s.teacher_comment, s.created_at, s.updated_at
     FROM course_assignment_submissions s JOIN users u ON u.id = s.student_id
     WHERE s.assignment_id = ?
     ORDER BY s.updated_at DESC`,
    req.params.aid,
  );
  return res.json(subs);
});

router.post("/courses/:id/assignments/:aid/submissions/:sid/grade", authRequired, (req, res) => {
  const access = ensureCourseAccess(req.params.id, req.user);
  if (access.error) return res.status(access.error).json({ error: "no access" });
  if (!access.isTeacher && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  run(
    "UPDATE course_assignment_submissions SET grade_points = ?, teacher_comment = ?, status = 'graded', updated_at = ? WHERE id = ?",
    Number(req.body?.grade_points ?? 0) || 0,
    String(req.body?.teacher_comment ?? ""),
    nowIso(),
    req.params.sid,
  );
  const sub = get(
    `SELECT s.id, s.assignment_id, s.student_id, u.nickname as student_nickname,
            s.content, s.status, s.grade_points, s.teacher_comment, s.created_at, s.updated_at
     FROM course_assignment_submissions s JOIN users u ON u.id = s.student_id WHERE s.id = ?`,
    req.params.sid,
  );
  return res.json(sub);
});

router.post("/courses/:id/lectures", authRequired, (req, res) => {
  const access = ensureCourseAccess(req.params.id, req.user);
  if (access.error) return res.status(access.error).json({ error: "no access" });
  if (!access.isTeacher && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  const id = uuidv4();
  const now = nowIso();
  run(
    `INSERT INTO course_lectures (id, course_id, author_id, title, body_text, video_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    access.course.id,
    req.user.id,
    String(req.body?.title ?? ""),
    String(req.body?.body_text ?? ""),
    String(req.body?.video_url ?? ""),
    now,
  );
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  for (const att of attachments) {
    run(
      "INSERT INTO course_lecture_attachments (id, lecture_id, file_name, url, created_at) VALUES (?, ?, ?, ?, ?)",
      uuidv4(),
      id,
      String(att.file_name ?? ""),
      String(att.url ?? ""),
      now,
    );
  }
  if (req.body?.task && typeof req.body.task === "object") {
    const taskId = uuidv4();
    run(
      `INSERT INTO course_assignments (id, course_id, author_id, title, description, due_at, max_points, created_at, lecture_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      taskId,
      access.course.id,
      req.user.id,
      String(req.body.task.title ?? ""),
      String(req.body.task.description ?? ""),
      String(req.body.task.due_at ?? ""),
      Number(req.body.task.max_points ?? 100) || 100,
      now,
      id,
    );
  }
  const row = get(
    `SELECT l.id, l.course_id, l.author_id, u.nickname as author_nickname,
            l.title, l.body_text, l.video_url, l.created_at
     FROM course_lectures l JOIN users u ON u.id = l.author_id WHERE l.id = ?`,
    id,
  );
  return res.json({ ...row, attachments: attachmentsFor(id) });
});

router.patch("/courses/:id/lectures/:lid", authRequired, (req, res) => {
  const access = ensureCourseAccess(req.params.id, req.user);
  if (access.error) return res.status(access.error).json({ error: "no access" });
  if (!access.isTeacher && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  const fields = ["title", "body_text", "video_url"];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      run(`UPDATE course_lectures SET ${f} = ? WHERE id = ?`, req.body[f], req.params.lid);
    }
  }
  if (Array.isArray(req.body?.attachments)) {
    run("DELETE FROM course_lecture_attachments WHERE lecture_id = ?", req.params.lid);
    for (const att of req.body.attachments) {
      run(
        "INSERT INTO course_lecture_attachments (id, lecture_id, file_name, url, created_at) VALUES (?, ?, ?, ?, ?)",
        uuidv4(),
        req.params.lid,
        String(att.file_name ?? ""),
        String(att.url ?? ""),
        nowIso(),
      );
    }
  }
  const row = get(
    `SELECT l.id, l.course_id, l.author_id, u.nickname as author_nickname,
            l.title, l.body_text, l.video_url, l.created_at
     FROM course_lectures l JOIN users u ON u.id = l.author_id WHERE l.id = ?`,
    req.params.lid,
  );
  return res.json({ ...row, attachments: attachmentsFor(req.params.lid) });
});

export default router;
