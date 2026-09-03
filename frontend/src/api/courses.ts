import { api } from "./http";

export type CoTeacher = {
  id: string;
  nickname: string;
};

export type Course = {
  id: string;
  course_code: string;
  title: string;
  description: string;
  is_open: boolean;
  teacher_id: string;
  teacher_nickname: string;
  co_teachers: CoTeacher[];
  is_owner: boolean;
  created_at: string;
  enrolled: boolean;
  is_pinned?: boolean;
  is_global_pinned?: boolean;
  icon_url?: string;
};

export type CourseListResponse = {
  courses: Course[];
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

export type SubmissionAttachment = {
  id: string;
  file_name: string;
  url: string;
  size_bytes: number;
  mime_type: string;
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
  attachments: SubmissionAttachment[];
};

export type Assignment = {
  id: string;
  course_id: string;
  author_id: string;
  author_nickname: string;
  title: string;
  description: string;
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
  attachments: SubmissionAttachment[];
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
  is_owner: boolean;
  stream: CourseStreamPost[];
  assignments: Assignment[];
  lectures: Lecture[];
  members: CourseMember[];
  co_teachers: CoTeacher[];
};

export function listCourses(token: string) {
  return api<CourseListResponse>("/api/courses", { token });
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

export function updateCourse(
  id: string,
  token: string,
  payload: { title?: string; description?: string; is_open?: boolean },
) {
  return api<Course>(`/api/courses/${id}`, {
    method: "PATCH",
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

export function setCoursePinned(courseId: string, pinned: boolean, token: string) {
  return api<Course>(`/api/courses/${courseId}/pin`, {
    method: "POST",
    token,
    body: JSON.stringify({ pinned }),
  });
}

export function deleteCourse(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/courses/${id}`, { method: "DELETE", token });
}

export function listCoTeachers(courseId: string, token: string) {
  return api<CoTeacher[]>(`/api/courses/${courseId}/co-teachers`, { token });
}

export function addCoTeacher(courseId: string, nickname: string, token: string) {
  return api<CoTeacher>(`/api/courses/${courseId}/co-teachers`, {
    method: "POST",
    token,
    body: JSON.stringify({ nickname }),
  });
}

export function removeCoTeacher(courseId: string, userId: string, token: string) {
  return api<{ ok: boolean }>(`/api/courses/${courseId}/co-teachers/${userId}`, {
    method: "DELETE",
    token,
  });
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
  payload: { title?: string; description?: string; max_points?: number },
  token: string,
) {
  return api<Assignment>(`/api/courses/${courseId}/assignments/${assignmentId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function submitAssignment(
  courseId: string,
  assignmentId: string,
  content: string,
  token: string,
  attachments: { file_name: string; url: string; size_bytes?: number; mime_type?: string }[] = [],
) {
  return api<AssignmentSubmissionMine>(`/api/courses/${courseId}/assignments/${assignmentId}/submit`, {
    method: "POST",
    token,
    body: JSON.stringify({ content, attachments }),
  });
}

export async function uploadSubmissionFile(
  courseId: string,
  assignmentId: string,
  file: File,
  token: string,
) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(
    `/api/courses/${courseId}/assignments/${assignmentId}/upload-submission`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? "upload error");
  }
  return (await res.json()) as {
    url: string;
    file_name: string;
    size_bytes: number;
    mime_type: string;
  };
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

export async function uploadCourseIcon(courseId: string, file: File, token: string) {
  const fd = new FormData();
  fd.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api/courses/${courseId}/icon`, {
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
  return data as { icon_url: string };
}

export function deleteCourseIcon(courseId: string, token: string) {
  return api<{ icon_url: string }>(`/api/courses/${courseId}/icon`, {
    method: "DELETE",
    token,
  });
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
    task?: { title: string; description?: string; max_points?: number };
  },
  token: string,
) {
  return api<Lecture>(`/api/courses/${courseId}/lectures`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function reorderLectures(courseId: string, ids: string[], token: string) {
  return api<{ ok: true }>(`/api/courses/${courseId}/lectures-order`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ ids }),
  });
}

export function deleteLecture(courseId: string, lectureId: string, token: string) {
  return api<{ ok: true }>(`/api/courses/${courseId}/lectures/${lectureId}`, {
    method: "DELETE",
    token,
  });
}

export function deleteAssignment(courseId: string, assignmentId: string, token: string) {
  return api<{ ok: true }>(`/api/courses/${courseId}/assignments/${assignmentId}`, {
    method: "DELETE",
    token,
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
