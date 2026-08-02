import { api } from "./http";

export type AiStatus = {
  enabled: boolean;
  can_generate: boolean;
  chat_limit: number;
  chat_used: number;
  generate_limit: number;
  generate_used: number;
};

export type AiChatMessage = {
  role: "user" | "model";
  text: string;
};

export type AiChatReply = {
  reply: string;
  used: number;
  limit: number;
};

export type AiOutlineTopic = {
  title: string;
  summary: string;
};

export function getAiStatus(token: string) {
  return api<AiStatus>("/api/ai/status", { token });
}

export function askCourseTutor(
  token: string,
  payload: { course_id: string; lecture_id?: string | null; messages: AiChatMessage[] },
) {
  return api<AiChatReply>("/api/ai/chat", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function generateCourseOutline(
  token: string,
  payload: { title: string; description?: string; count?: number },
) {
  return api<{ topics: AiOutlineTopic[] }>("/api/ai/course-outline", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function generateLectureImage(token: string, payload: { topic: string }) {
  return api<{ url: string }>("/api/ai/image", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function generateLectureDraft(
  token: string,
  payload: { topic: string; course_title?: string; notes?: string },
) {
  return api<{ title: string; body: string }>("/api/ai/lecture-draft", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}
