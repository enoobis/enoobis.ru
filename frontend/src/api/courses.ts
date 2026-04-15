import { api } from "./http";

export type Course = {
  id: string;
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

export type CourseClassroom = {
  course: Course;
  is_teacher: boolean;
  stream: CourseStreamPost[];
  assignments: Assignment[];
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

export function createAssignment(
  courseId: string,
  payload: { title: string; description?: string; due_at?: string; max_points?: number },
  token: string,
) {
  return api<Assignment>(`/api/courses/${courseId}/assignments`, {
    method: "POST",
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
