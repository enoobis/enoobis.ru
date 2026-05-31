import { api } from "./http";

export type BlogListItem = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  cover_image_url: string;
  status: "draft" | "pending" | "published" | "archived";
  author_nickname: string;
  created_at: string;
  published_at: string | null;
  updated_at: string;
  tags: string[];
  categories: string[];
  up_count: number;
  down_count: number;
  comment_count: number;
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  cover_image_url: string;
  status: "draft" | "pending" | "published" | "archived";
  author_id: string;
  author_nickname: string;
  created_at: string;
  published_at: string | null;
  updated_at: string;
  tags: string[];
  categories: string[];
  image_urls: string[];
  up_count: number;
  down_count: number;
  my_vote: 1 | -1 | null;
  bookmark_count: number;
  comment_count: number;
  bookmarked_by_me: boolean;
  can_edit: boolean;
};

export type PagedPosts = {
  items: BlogListItem[];
  page: number;
  page_size: number;
  total: number;
};

export type TaxonomyItem = {
  slug: string;
  name: string;
  post_count: number;
};

export type CommentItem = {
  id: string;
  post_id: string;
  user_id: string;
  author_nickname: string;
  body: string;
  status: string;
  parent_comment_id: string | null;
  created_at: string;
  updated_at: string;
};

export type VoteSummary = {
  up_count: number;
  down_count: number;
  my_vote: 1 | -1 | null;
};

export type MyPostState = {
  my_vote: 1 | -1 | null;
  bookmarked: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export type BlogReport = {
  id: string;
  target_type: "post" | "comment";
  target_post_id: string | null;
  target_comment_id: string | null;
  reporter_user_id: string;
  reporter_nickname?: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  /** пост для ссылки / скрытия (для коммента подставляется из comment.post_id) */
  related_post_id?: string | null;
  post_title?: string | null;
  post_author_nickname?: string | null;
  comment_preview?: string | null;
  comment_author_nickname?: string | null;
};

type BlogListQuery = {
  page?: number;
  page_size?: number;
  q?: string;
  tag?: string;
  category?: string;
  author?: string;
};

function withQuery(path: string, query: BlogListQuery = {}) {
  const u = new URL(path, window.location.origin);
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    u.searchParams.set(k, String(v));
  });
  return `${u.pathname}${u.search}`;
}

export function listPosts(query: BlogListQuery = {}) {
  return api<PagedPosts>(withQuery("/api/blog", query));
}

export function listMyPosts(token: string, query: BlogListQuery = {}) {
  return api<PagedPosts>(withQuery("/api/blog/mine", query), { token });
}

export function listAuthorPosts(nickname: string, query: BlogListQuery = {}) {
  return api<PagedPosts>(withQuery(`/api/blog/author/${encodeURIComponent(nickname)}`, query));
}

export function getPost(id: string, token?: string | null) {
  return api<BlogPost>(`/api/blog/${id}`, { token });
}

export function getPostForEdit(id: string, token: string) {
  return api<BlogPost>(`/api/blog/${id}/edit`, { token });
}

export function getMyPostState(id: string, token: string) {
  return api<MyPostState>(`/api/blog/${id}/me`, { token });
}

export function createPost(
  token: string,
  payload: {
    title: string;
    body: string;
    excerpt?: string;
    slug?: string;
    cover_image_url?: string;
    status?: "draft" | "pending" | "published" | "archived";
    tags?: string[];
    categories?: string[];
  },
) {
  return api<BlogPost>("/api/blog", { method: "POST", token, body: JSON.stringify(payload) });
}

export function updatePost(
  id: string,
  token: string,
  payload: {
    title?: string;
    body?: string;
    excerpt?: string;
    slug?: string;
    cover_image_url?: string;
    status?: "draft" | "pending" | "published" | "archived";
    tags?: string[];
    categories?: string[];
  },
) {
  return api<BlogPost>(`/api/blog/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function publishPost(id: string, token: string) {
  return api<{ ok: boolean; status?: string }>(`/api/blog/${id}/publish`, { method: "POST", token });
}

export function archivePost(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/blog/${id}/archive`, { method: "POST", token });
}

export function deletePost(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/blog/${id}`, { method: "DELETE", token });
}

export function listComments(postId: string) {
  return api<CommentItem[]>(`/api/blog/${postId}/comments`);
}

export function createComment(postId: string, token: string, body: string) {
  return api<CommentItem>(`/api/blog/${postId}/comments`, {
    method: "POST",
    token,
    body: JSON.stringify({ body }),
  });
}

export function updateComment(commentId: string, token: string, body: string) {
  return api<CommentItem>(`/api/blog/comments/${commentId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ body }),
  });
}

export function deleteComment(commentId: string, token: string) {
  return api<{ ok: boolean }>(`/api/blog/comments/${commentId}`, { method: "DELETE", token });
}

export function reportPost(postId: string, token: string, reason: string) {
  return api<{ ok: boolean }>(`/api/blog/${postId}/report`, {
    method: "POST",
    token,
    body: JSON.stringify({ reason }),
  });
}

export function reportComment(commentId: string, token: string, reason: string) {
  return api<{ ok: boolean }>(`/api/blog/comments/${commentId}/report`, {
    method: "POST",
    token,
    body: JSON.stringify({ reason }),
  });
}

export function votePost(postId: string, token: string, vote: 1 | -1) {
  return api<VoteSummary>(`/api/blog/${postId}/vote`, {
    method: "POST",
    token,
    body: JSON.stringify({ vote }),
  });
}

export function bookmarkPost(postId: string, token: string) {
  return api<{ ok: boolean }>(`/api/blog/${postId}/bookmark`, { method: "POST", token });
}

export function unbookmarkPost(postId: string, token: string) {
  return api<{ ok: boolean }>(`/api/blog/${postId}/bookmark`, { method: "DELETE", token });
}

export function listMyBookmarks(token: string, query: BlogListQuery = {}) {
  return api<PagedPosts>(withQuery("/api/blog/bookmarks/me", query), { token });
}

export function listTags() {
  return api<TaxonomyItem[]>("/api/blog/tags");
}

export function listCategories() {
  return api<TaxonomyItem[]>("/api/blog/categories");
}

export async function uploadBlogImage(file: File, token: string, postId?: string) {
  const fd = new FormData();
  fd.append("file", file);
  if (postId) fd.append("post_id", postId);
  const res = await fetch("/api/blog/upload-image", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data as { url: string };
}

export type PendingBlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  cover_image_url: string;
  status: "pending";
  author_nickname: string;
  created_at: string;
  published_at: string | null;
  updated_at: string;
};

export function listPendingBlogPosts(token: string) {
  return api<PendingBlogPost[]>("/api/admin/blog/pending", { token });
}

export function approveBlogPost(id: string, token: string) {
  return api<{ ok: boolean; status: string }>(`/api/admin/blog/posts/${id}/approve`, {
    method: "POST",
    token,
  });
}

export function listBlogReports(token: string) {
  return api<BlogReport[]>("/api/admin/blog/reports", { token });
}

export function resolveBlogReport(id: string, status: "resolved" | "dismissed", token: string) {
  return api<{ ok: boolean }>(`/api/admin/blog/reports/${id}/resolve`, {
    method: "POST",
    token,
    body: JSON.stringify({ status }),
  });
}

export function deleteBlogReport(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/admin/blog/reports/${id}`, { method: "DELETE", token });
}

export function hidePostByAdmin(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/admin/blog/posts/${id}/hide`, { method: "POST", token });
}

export function hideCommentByAdmin(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/admin/blog/comments/${id}/hide`, {
    method: "POST",
    token,
  });
}

export function restoreCommentByAdmin(id: string, token: string) {
  return api<{ ok: boolean }>(`/api/admin/blog/comments/${id}/restore`, {
    method: "POST",
    token,
  });
}
