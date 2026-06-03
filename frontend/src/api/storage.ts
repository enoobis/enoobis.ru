import { api } from "./http";

export type Note = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type ShareLink = {
  id: string;
  token: string;
  target_type: "file" | "note";
  target_id: string;
  expires_at: string | null;
  created_at: string;
  label?: string;
};

export type ShareTtl = "1h" | "1d" | "7d" | "forever";

export function listNotes(token: string) {
  return api<{ items: Note[] }>("/api/notes", { token });
}

export function createNote(token: string, payload: { title: string; body: string }) {
  return api<Note>("/api/notes", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function updateNote(
  token: string,
  id: string,
  payload: { title?: string; body?: string },
) {
  return api<Note>(`/api/notes/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function deleteNote(token: string, id: string) {
  return api<{ ok: boolean }>(`/api/notes/${id}`, { method: "DELETE", token });
}

export function listShares(token: string) {
  return api<{ items: ShareLink[] }>("/api/shares", { token });
}

export function createShare(
  token: string,
  payload: { target_type: "file" | "note"; target_id: string; ttl: ShareTtl },
) {
  return api<ShareLink>("/api/shares", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function deleteShare(token: string, id: string) {
  return api<{ ok: boolean }>(`/api/shares/${id}`, { method: "DELETE", token });
}

export type SharePayload =
  | {
      kind: "file";
      owner_nickname: string;
      expires_at: string | null;
      file: {
        id: string;
        original_name: string;
        mime_type: string;
        size_bytes: number;
        created_at: string;
      };
    }
  | {
      kind: "note";
      owner_nickname: string;
      expires_at: string | null;
      note: Note;
    };

export function getShare(token: string) {
  return api<SharePayload>(`/api/share/${token}`);
}

export function shareDownloadUrl(token: string) {
  return `/api/share/${token}/download`;
}

export function shareReadUrl(token: string) {
  return `/api/share/${encodeURIComponent(token)}/read`;
}
