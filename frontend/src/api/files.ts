import { api } from "./http";

export type StoredFile = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type FilesList = {
  items: StoredFile[];
  used: number;
  quota: number;
};

export function listFiles(token: string) {
  return api<FilesList>("/api/files", { token });
}

export async function uploadFile(token: string, file: File): Promise<StoredFile> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/files", {
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
  return data as StoredFile;
}

export function deleteFile(token: string, id: string) {
  return api<{ ok: boolean }>(`/api/files/${id}`, { method: "DELETE", token });
}

export async function fileReadUrl(id: string, token: string): Promise<string> {
  const r = await api<{ access: string }>(`/api/files/${encodeURIComponent(id)}/read-access`, {
    method: "POST",
    token,
  });
  const qs = new URLSearchParams({ access: r.access });
  return `/api/files/${encodeURIComponent(id)}/read?${qs}`;
}

export async function downloadFile(token: string, id: string, name: string) {
  const res = await fetch(`/api/files/${id}/download`, {
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
