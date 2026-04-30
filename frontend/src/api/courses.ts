import { api } from "./http";

export type Course = {
  id: string;
  course_code: string;
  title: string;
  description: string;
  is_open: boolean;
  teacher_id: string;
  teacher_nickname: string;
  created_at: string;
  enrolled: boolean;
};

export type CourseMember = {
  id: string;
  nickname: string;
  role: string;
};

export type CourseStreamPost = {
  id: string;
  course_id: string;
  author_id: string;
  author_nickname: string;
  body: string;
  created_at: string;
  comments: CourseStreamComment[];
};

export type CourseStreamComment = {
  id: string;
  post_id: string;
  course_id: string;
  author_id: string;
  author_nickname: string;
  body: string;
  created_at: string;
};

export type AssignmentSubmissionMine = {
  id: string;
  content: string;
  status: string;
  grade_points: number | null;
  teacher_comment: string;
  created_at: string;
  updated_at: string;
};

export type Assignment = {
  id: string;
  course_id: string;
  author_id: string;
  author_nickname: string;
  title: string;
  description: string;
  due_at: string;
  max_points: number;
  created_at: string;
  lecture_id: string | null;
  my_submission: AssignmentSubmissionMine | null;
};

export type AssignmentSubmission = {
  id: string;
  assignment_id: string;
  student_id: string;
  student_nickname: string;
  content: string;
  status: string;
  grade_points: number | null;
  teacher_comment: string;
  created_at: string;
  updated_at: string;
};

export type LectureAttachment = {
  id: string;
  file_name: string;
  url: string;
  created_at: string;
};

export type Lecture = {
  id: string;
  course_id: string;
  author_id: string;
  author_nickname: string;
  title: string;
  body_text: string;
  video_url: string;
  created_at: string;
  attachments: LectureAttachment[];
};

export type CourseClassroom = {
  course: Course;
  is_teacher: boolean;
  stream: CourseStreamPost[];
  assignments: Assignment[];
  lectures: Lecture[];
  members: CourseMember[];
};

export function listCourses(token: string) {
  return api<Course[]>("/api/courses", { token });
}

export function createCourse(
  token: string,
  payload: { title: string; description?: string; is_open: boolean },
) {
  return api<Course>("/api/courses", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function enrollCourse(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/courses/${id}/enroll`, { method: "POST", token });
}

export function joinCourseByCode(code: string, token: string) {
  return api<Course>("/api/courses/join-by-code", {
    method: "POST",
    token,
    body: JSON.stringify({ code }),
  });
}

export function unenrollCourse(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/courses/${id}/enroll`, { method: "DELETE", token });
}

export function setClosedStudents(courseId: string, student_ids: string[], token: string) {
  return api<{ ok: boolean }>(`/api/courses/${courseId}/students`, {
    method: "POST",
    token,
    body: JSON.stringify({ student_ids }),
  });
}

export function getClassroom(courseId: string, token: string) {
  return api<CourseClassroom>(`/api/courses/${courseId}/classroom`, { token });
}

export function createStreamPost(courseId: string, body: string, token: string) {
  return api<CourseStreamPost>(`/api/courses/${courseId}/stream`, {
    method: "POST",
    token,
    body: JSON.stringify({ body }),
  });
}

export function createStreamComment(courseId: string, postId: string, body: string, token: string) {
  return api<CourseStreamComment>(`/api/courses/${courseId}/stream/${postId}/comments`, {
    method: "POST",
    token,
    body: JSON.stringify({ body }),
  });
}

export function createAssignment(
  courseId: string,
  payload: {
    title: string;
    description?: string;
    due_at?: string;
    max_points?: number;
    lecture_id?: string;
  },
  token: string,
) {
  return api<Assignment>(`/api/courses/${courseId}/assignments`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function patchAssignment(
  courseId: string,
  assignmentId: string,
  payload: { title?: string; description?: string; due_at?: string; max_points?: number },
  token: string,
) {
  return api<Assignment>(`/api/courses/${courseId}/assignments/${assignmentId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function submitAssignment(courseId: string, assignmentId: string, content: string, token: string) {
  return api<AssignmentSubmissionMine>(`/api/courses/${courseId}/assignments/${assignmentId}/submit`, {
    method: "POST",
    token,
    body: JSON.stringify({ content }),
  });
}

export function listAssignmentSubmissions(courseId: string, assignmentId: string, token: string) {
  return api<AssignmentSubmission[]>(`/api/courses/${courseId}/assignments/${assignmentId}/submissions`, {
    token,
  });
}

export function gradeSubmission(
  courseId: string,
  assignmentId: string,
  submissionId: string,
  payload: { grade_points: number; teacher_comment?: string },
  token: string,
) {
  return api<AssignmentSubmission>(
    `/api/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/grade`,
    {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    },
  );
}

export async function uploadLectureAttachment(courseId: string, file: File, token: string) {
  const fd = new FormData();
  fd.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api/courses/${courseId}/lectures/upload`, {
    method: "POST",
    headers,
    body: fd,
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error ?? res.statusText;
    throw new Error(err);
  }
  return data as { url: string; file_name: string };
}

export function createLecture(
  courseId: string,
  payload: {
    title: string;
    body_text?: string;
    video_url?: string;
    attachments?: { file_name: string; url: string }[];
    task?: { title: string; description?: string; due_at?: string; max_points?: number };
  },
  token: string,
) {
  return api<Lecture>(`/api/courses/${courseId}/lectures`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function patchLecture(
  courseId: string,
  lectureId: string,
  payload: {
    title?: string;
    body_text?: string;
    video_url?: string;
    attachments?: { file_name: string; url: string }[];
  },
  token: string,
) {
  return api<Lecture>(`/api/courses/${courseId}/lectures/${lectureId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}
