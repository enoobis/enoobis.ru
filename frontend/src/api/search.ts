import { api } from "./http";

export type SearchBlog = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  published_at: string | null;
  created_at: string;
  author_nickname: string;
};

export type SearchMicro = {
  id: string;
  body: string;
  created_at: string;
  author_nickname: string;
  author_avatar: string;
};

export type SearchUser = {
  nickname: string;
  full_name: string;
  avatar_url: string;
};

export type SearchResponse = {
  blog: SearchBlog[];
  micro: SearchMicro[];
  users: SearchUser[];
};

export function search(q: string, limit = 8) {
  const u = new URL("/api/search", window.location.origin);
  u.searchParams.set("q", q);
  u.searchParams.set("limit", String(limit));
  return api<SearchResponse>(`${u.pathname}${u.search}`);
}
