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

export function getAiStatus(token: string) {
  return api<AiStatus>("/api/ai/status", { token });
}

export function askCourseTutor(
  token: string,
  payload: { course_id: string; lecture_id?: string | null; message: string },
) {
  return api<AiChatReply>("/api/ai/chat", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

/** история живёт неделю, дальше сервер её чистит */
export function getChatHistory(token: string, courseId: string) {
  return api<{ messages: AiChatMessage[] }>(`/api/ai/chat/${courseId}`, { token });
}

export function clearChatHistory(token: string, courseId: string) {
  return api<{ ok: true }>(`/api/ai/chat/${courseId}`, { method: "DELETE", token });
}
