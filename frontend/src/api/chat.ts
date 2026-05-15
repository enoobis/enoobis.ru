import { api } from "./http";

export type ChatThread = {
  id: string;
  other_nickname: string;
  other_avatar: string;
  last_body: string;
  last_from_me: boolean;
  last_at: string | null;
  unread: number;
};

export type ChatReplyRef = {
  id: string;
  from_me: boolean;
  body: string;
  image_url: string;
};

export type ChatMessage = {
  id: string;
  from_me: boolean;
  body: string;
  image_url?: string;
  created_at: string;
  edited_at?: string | null;
  read: boolean;
  reply_to?: ChatReplyRef | null;
};

export type ChatMessages = {
  items: ChatMessage[];
  other: { id: string; nickname: string; avatar_url: string } | null;
};

export function listChats(token: string) {
  return api<{ items: ChatThread[] }>("/api/chats", { token });
}

export function chatsUnread(token: string) {
  return api<{ unread: number }>("/api/chats/unread-count", { token });
}

export function openChatWith(nickname: string, token: string) {
  return api<ChatThread>(`/api/chats/with/${encodeURIComponent(nickname)}`, {
    method: "POST",
    token,
  });
}

export function listMessages(threadId: string, token: string, after?: string) {
  const url = after
    ? `/api/chats/${threadId}/messages?after=${encodeURIComponent(after)}`
    : `/api/chats/${threadId}/messages`;
  return api<ChatMessages>(url, { token });
}

export function listOutgoingReadFlags(threadId: string, token: string) {
  return api<{ items: { id: string; read: boolean }[] }>(
    `/api/chats/${threadId}/outgoing-read`,
    { token },
  );
}

export function sendMessage(
  threadId: string,
  token: string,
  payload: { body?: string; image_url?: string; reply_to?: string },
) {
  return api<ChatMessage>(`/api/chats/${threadId}/messages`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function uploadChatImage(threadId: string, token: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/chats/${threadId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? "upload error");
  }
  return (await res.json()) as { url: string };
}

export function markChatRead(threadId: string, token: string) {
  return api<{ ok: boolean }>(`/api/chats/${threadId}/read`, {
    method: "POST",
    token,
  });
}

export function deleteChatThread(threadId: string, token: string) {
  return api<{ ok: boolean }>(`/api/chats/${threadId}`, {
    method: "DELETE",
    token,
  });
}

export function editMessage(messageId: string, token: string, body: string) {
  return api<ChatMessage>(`/api/chats/messages/${messageId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ body }),
  });
}

export function clearThreadMessages(threadId: string, token: string) {
  return api<{ ok: boolean }>(`/api/chats/${threadId}/messages`, {
    method: "DELETE",
    token,
  });
}

export function deleteMessage(messageId: string, token: string) {
  return api<{ ok: boolean }>(`/api/chats/messages/${messageId}`, {
    method: "DELETE",
    token,
  });
}
