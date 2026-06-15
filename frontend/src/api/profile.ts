import { api } from "./http";

export type ActivitySummary = {
  year: number;
  registration_year: number;
  current_year: number;
  total_seconds: number;
  days: Array<{
    day: string;
    seconds_spent: number;
  }>;
};

export type PrivacySettings = {
  profile_visibility: "public" | "followers" | "private";
  activity_visibility: "public" | "followers" | "private";
  media_visibility: "public" | "followers" | "private";
  show_birthday: boolean;
  show_country: boolean;
};

export type NotificationSettings = {
  email_enabled: boolean;
  push_enabled: boolean;
  course_updates: boolean;
  assignment_deadlines: boolean;
  grades_released: boolean;
  new_followers: boolean;
  marketing_news: boolean;
};

export function getProfileActivity(nickname: string, token?: string | null, year?: number) {
  const q = typeof year === "number" ? `?year=${year}` : "";
  return api<ActivitySummary>(`/api/profile/${nickname}/activity${q}`, { token });
}

export function getMyPrivacy(token: string) {
  return api<PrivacySettings>("/api/me/privacy", { token });
}

export function patchMyPrivacy(token: string, payload: Partial<PrivacySettings>) {
  return api<PrivacySettings>("/api/me/privacy", {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function getMyNotifications(token: string) {
  return api<NotificationSettings>("/api/me/notifications", { token });
}

export function patchMyNotifications(token: string, payload: Partial<NotificationSettings>) {
  return api<NotificationSettings>("/api/me/notifications", {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function changeMyPassword(token: string, current_password: string, new_password: string) {
  return api<{ ok: boolean; token?: string }>("/api/me/password", {
    method: "POST",
    token,
    body: JSON.stringify({ current_password, new_password }),
  });
}

export type Achievement = {
  key: string;
  title: string;
  description: string;
  earned: boolean;
  earned_at: string | null;
};

export function listMyAchievements(token: string) {
  return api<{ items: Achievement[] }>("/api/me/achievements", { token });
}
