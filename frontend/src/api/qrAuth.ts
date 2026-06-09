import { api } from "./http";

export type QrIssueResponse = {
  code: string;
  expires_at: string;
  expires_in: number;
};

export type QrClaimResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    nickname: string;
    role: string;
    status: string;
    coins?: number;
  };
};

export function issueQrCode(token: string) {
  return api<QrIssueResponse>("/api/qr/issue", { method: "POST", token });
}

export function claimQrCode(code: string) {
  return api<QrClaimResponse>("/api/qr/claim", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function qrLoginUrl(code: string) {
  const u = new URL("/auth/qr", window.location.origin);
  u.searchParams.set("code", code);
  return u.toString();
}

export function extractQrCode(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const u = new URL(t, window.location.origin);
    const c = u.searchParams.get("code");
    if (c && /^[a-f0-9]{32,64}$/i.test(c)) return c;
  } catch {
    /* ignore */
  }
  if (/^[a-f0-9]{32,64}$/i.test(t)) return t;
  const m = t.match(/code=([a-f0-9]{32,64})/i);
  return m?.[1] ?? "";
}

/* обратный поток: это устройство хочет войти, другое подтверждает */

export type QrPollResponse = {
  pending: boolean;
  token?: string;
  user?: QrClaimResponse["user"];
};

export function requestQrLogin() {
  return api<QrIssueResponse>("/api/qr/request", { method: "POST" });
}

export function approveQrLogin(token: string, code: string) {
  return api<{ ok: boolean }>("/api/qr/approve", {
    method: "POST",
    token,
    body: JSON.stringify({ code }),
  });
}

export function pollQrLogin(code: string) {
  return api<QrPollResponse>("/api/qr/poll", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function qrApproveUrl(code: string) {
  const u = new URL("/auth/qr", window.location.origin);
  u.searchParams.set("approve", code);
  return u.toString();
}

export function extractApproveCode(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const u = new URL(t, window.location.origin);
    const c = u.searchParams.get("approve");
    if (c && /^[a-f0-9]{32,64}$/i.test(c)) return c;
  } catch {
    /* ignore */
  }
  const m = t.match(/approve=([a-f0-9]{32,64})/i);
  return m?.[1] ?? "";
}
