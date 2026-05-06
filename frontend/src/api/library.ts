import { api } from "./http";

export type LibraryBook = {
  id: string;
  title: string;
  author: string;
  description: string;
  category: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploader_nickname: string;
  created_at: string;
};

export type LibraryCategory = { category: string; count: number };

export type ListBooksParams = {
  q?: string;
  category?: string;
  sort?: "new" | "title";
};

export function listBooks(token: string, params: ListBooksParams = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.sort) qs.set("sort", params.sort);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<{ items: LibraryBook[] }>(`/api/library${suffix}`, { token });
}

export function listCategories(token: string) {
  return api<{ items: LibraryCategory[] }>("/api/library/categories", { token });
}

export async function uploadBook(
  token: string,
  payload: { title: string; author: string; description: string; category: string; file: File },
): Promise<LibraryBook> {
  const form = new FormData();
  form.append("file", payload.file);
  form.append("title", payload.title);
  form.append("author", payload.author);
  form.append("description", payload.description);
  form.append("category", payload.category);
  const res = await fetch("/api/library", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
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
    throw new Error((data as { error?: string })?.error ?? res.statusText);
  }
  return data as LibraryBook;
}

export function deleteBook(token: string, id: string) {
  return api<{ ok: boolean }>(`/api/library/${id}`, { method: "DELETE", token });
}

export async function downloadBook(token: string, id: string, name: string) {
  const res = await fetch(`/api/library/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(res.statusText);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
