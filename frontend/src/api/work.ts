import { api } from "./http";

export type WorkPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  qr_secret: string;
  created_at: string;
  checkin_count?: number;
};

export type WorkCheckin = {
  id: string;
  created_at: string;
  distance_m: number;
  point_id: string;
  nickname: string;
  full_name: string;
  point_name: string;
};

export type CheckinResult = {
  ok: boolean;
  point_name: string;
  distance_m: number;
  created_at: string;
};

export function listWorkPoints(token: string) {
  return api<{ items: WorkPoint[] }>("/api/admin/work/points", { token });
}

export function createWorkPoint(
  token: string,
  body: { name: string; lat: number; lng: number; radius_m: number },
) {
  return api<WorkPoint>("/api/admin/work/points", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function updateWorkPoint(
  token: string,
  id: string,
  body: Partial<{ name: string; lat: number; lng: number; radius_m: number }>,
) {
  return api<WorkPoint>(`/api/admin/work/points/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export function deleteWorkPoint(token: string, id: string) {
  return api<{ ok: boolean }>(`/api/admin/work/points/${id}`, {
    method: "DELETE",
    token,
  });
}

export function listWorkCheckins(
  token: string,
  fromIso: string,
  toIso: string,
  pointId?: string,
) {
  const qs = new URLSearchParams({ from: fromIso, to: toIso });
  if (pointId) qs.set("point_id", pointId);
  return api<{ items: WorkCheckin[] }>(`/api/admin/work/checkins?${qs}`, { token });
}

export function workExportUrl(fromIso: string, toIso: string, pointId?: string) {
  const qs = new URLSearchParams({ from: fromIso, to: toIso });
  if (pointId) qs.set("point_id", pointId);
  return `/api/admin/work/export?${qs}`;
}

export async function downloadWorkExport(
  token: string,
  fromIso: string,
  toIso: string,
  pointId?: string,
) {
  const res = await fetch(workExportUrl(fromIso, toIso, pointId), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("не удалось скачать");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "checkins.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

export function workCheckin(token: string, body: { code: string; lat: number; lng: number }) {
  return api<CheckinResult>("/api/work/checkin", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function workQrUrl(secret: string) {
  const u = new URL("/work", window.location.origin);
  u.searchParams.set("c", secret);
  return u.toString();
}

export function extractWorkCode(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    const c = u.searchParams.get("c");
    if (c) return c.trim();
  } catch {
    /* не url — значит сам код */
  }
  return s;
}
