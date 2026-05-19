import { api } from "./http";

export type MicroPost = {
  id: string;
  body: string;
  image_url: string;
  parent_id: string | null;
  author_id: string;
  author_nickname: string;
  author_avatar: string;
  created_at: string;
  up_count: number;
  down_count: number;
  my_vote: 1 | -1 | null;
  reply_count: number;
  bookmarked_by_me?: boolean;
};

export type VoteSummary = {
  up_count: number;
  down_count: number;
  my_vote: 1 | -1 | null;
};

export type MicroFeed = {
  items: MicroPost[];
  page: number;
  page_size: number;
  total: number;
};

export type MicroDetail = {
  post: MicroPost;
  replies: MicroPost[];
};

export type FeedQuery = {
  page?: number;
  page_size?: number;
  q?: string;
  author?: string;
  feed?: "all" | "following";
};

function withQuery(path: string, query: FeedQuery = {}) {
  const u = new URL(path, window.location.origin);
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    u.searchParams.set(k, String(v));
  });
  return `${u.pathname}${u.search}`;
}

export function listMicro(query: FeedQuery = {}, token?: string | null) {
  return api<MicroFeed>(withQuery("/api/micro", query), { token });
}

export function getMicro(id: string, token?: string | null) {
  return api<MicroDetail>(`/api/micro/${id}`, { token });
}

export function listMicroByAuthor(nickname: string, token?: string | null) {
  return api<{ items: MicroPost[] }>(
    `/api/micro/by/${encodeURIComponent(nickname)}`,
    { token },
  );
}

export function createMicro(
  token: string,
  payload: { body: string; image_url?: string; parent_id?: string | null },
) {
  return api<MicroPost>("/api/micro", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function deleteMicro(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/micro/${id}`, { method: "DELETE", token });
}

export function updateMicro(id: string, token: string, body: string) {
  return api<MicroPost>(`/api/micro/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ body }),
  });
}

export function voteMicro(id: string, token: string, vote: 1 | -1) {
  return api<VoteSummary>(`/api/micro/${id}/vote`, {
    method: "POST",
    token,
    body: JSON.stringify({ vote }),
  });
}

export function bookmarkMicro(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/micro/${id}/bookmark`, { method: "POST", token });
}

export function unbookmarkMicro(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/micro/${id}/bookmark`, { method: "DELETE", token });
}

export function listMyMicroBookmarks(token: string, query: FeedQuery = {}) {
  return api<MicroFeed>(withQuery("/api/micro/bookmarks/me", query), { token });
}

export async function uploadMicroImage(file: File, token: string) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/micro/upload-image", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data as { url: string };
}
