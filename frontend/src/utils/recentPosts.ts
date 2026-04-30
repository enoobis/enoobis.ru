import type { BlogPost } from "../api/blog";

const STORAGE_KEY = "enoobis_recent_blog_posts";
const MAX_ITEMS = 12;

export type RecentPostItem = {
  id: string;
  title: string;
  cover_image_url: string;
  author_nickname: string;
  opened_at: string;
  progress: number;
};

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function listRecentPosts(): RecentPostItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPostItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string");
  } catch {
    return [];
  }
}

function saveRecentPosts(items: RecentPostItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export function addRecentPost(post: BlogPost) {
  const items = listRecentPosts();
  const now = new Date().toISOString();
  const next: RecentPostItem = {
    id: post.id,
    title: post.title,
    cover_image_url: post.cover_image_url,
    author_nickname: post.author_nickname,
    opened_at: now,
    progress: items.find((i) => i.id === post.id)?.progress ?? 0,
  };
  const merged = [next, ...items.filter((i) => i.id !== post.id)];
  saveRecentPosts(merged);
}

export function updateRecentPostProgress(postId: string, progress: number) {
  const items = listRecentPosts();
  const idx = items.findIndex((i) => i.id === postId);
  if (idx < 0) return;
  items[idx].progress = clampProgress(progress);
  saveRecentPosts(items);
}
