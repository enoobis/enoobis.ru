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

export type LibraryListResponse = {
  items: LibraryBook[];
  storage_bytes_used: number;
};

export function listBooks(token: string, params: ListBooksParams = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.sort) qs.set("sort", params.sort);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<LibraryListResponse>(`/api/library${suffix}`, { token });
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

export function updateBookMetadata(
  token: string,
  id: string,
  payload: { title: string; author: string; description: string; category: string },
) {
  return api<LibraryBook>(`/api/library/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=(?:UTF-8''|utf-8'')([^;\n]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^["']|["']$/g, ""));
    } catch {
      /* ignore */
    }
  }
  const quoted = /filename="((?:\\"|[^"])*)"/i.exec(header);
  if (quoted) return quoted[1].replace(/\\"/g, '"');
  const plain = /filename=([^;\n]+)/i.exec(header);
  if (plain) return plain[1].trim().replace(/^["']|["']$/g, "");
  return null;
}

/** url для iframe/embed (на телефоне blob-url часто не открывает pdf) */
export function libraryReadUrl(id: string, token: string) {
  const qs = new URLSearchParams({ token });
  return `/api/library/${encodeURIComponent(id)}/read?${qs}`;
}

export async function fetchBookReadBlob(token: string, id: string): Promise<Blob> {
  const res = await fetch(`/api/library/${id}/read`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let errCode = "";
  if (!res.ok) {
    try {
      const j = (await res.json()) as { error?: string };
      errCode = j?.error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(errCode || res.statusText);
  }
  const raw = await res.blob();
  if (raw.type && raw.type !== "application/octet-stream") return raw;
  return new Blob([await raw.arrayBuffer()], { type: "application/pdf" });
}

export async function downloadBook(token: string, id: string, fallbackName: string) {
  const res = await fetch(`/api/library/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(res.statusText);
  const name = parseFilenameFromContentDisposition(res.headers.get("Content-Disposition")) ?? fallbackName;
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
