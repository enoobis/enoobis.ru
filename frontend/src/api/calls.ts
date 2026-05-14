import { api } from "./http";

export type CallSessionOk = {
  active: true;
  meetUrl: string;
};

export type CallSessionOff = {
  active: false;
};

export async function createCallSession(token: string): Promise<{ slug: string }> {
  return api("/api/calls", { method: "POST", token });
}

export async function getCallStatus(slug: string): Promise<CallSessionOk | CallSessionOff> {
  return api(`/api/calls/${encodeURIComponent(slug)}`, { method: "GET" });
}

export async function endCallSession(slug: string): Promise<void> {
  await api(`/api/calls/${encodeURIComponent(slug)}/end`, { method: "POST" });
}
