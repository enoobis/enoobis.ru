import { api } from "./http";

export type NewsItem = {
  id: string;
  title: string;
  body: string;
  image_url: string;
  source_url: string;
  source_name: string;
  created_at: string;
};

export function listNews(query: { limit?: number; offset?: number } = {}) {
  const q = new URLSearchParams();
  if (query.limit) q.set("limit", String(query.limit));
  if (query.offset) q.set("offset", String(query.offset));
  const suffix = q.size ? `?${q}` : "";
  return api<{ items: NewsItem[]; total: number }>(`/api/news${suffix}`);
}

export function getNews(id: string) {
  return api<NewsItem>(`/api/news/${id}`);
}

export function deleteNews(id: string, token: string) {
  return api<{ ok: true }>(`/api/news/${id}`, { method: "DELETE", token });
}
