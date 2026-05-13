import { api } from "./http";

export type PublishPeriod = "day" | "month" | "year" | "all";

export type PublishChannelLimits = {
  ban_until: string | null;
  ban_forever: boolean;
  max_per_period: number | null;
  period: PublishPeriod;
  min_interval_seconds: number | null;
};

export type PublishLimitsPayload = {
  blog: PublishChannelLimits;
  micro: PublishChannelLimits;
  blog_comment: PublishChannelLimits;
  chat: PublishChannelLimits;
};

export type AdminUserDetail = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  status: string;
  bio: string;
  full_name: string;
  website_url: string;
  readme_md: string;
  social_links: { name: string; url: string }[];
  avatar_url: string;
  nickname_change_count: number;
  created_at: string;
  coins: number;
  publish_limits: PublishLimitsPayload;
};

export type AdminInviteRow = {
  id: string;
  code: string;
  target_role: string;
  max_uses: number;
  used_count: number;
  remaining: number;
  created_at: string;
};

export async function getAdminUserDetail(token: string, userId: string): Promise<AdminUserDetail> {
  return api(`/api/admin/users/${userId}`, { token });
}

export type PublishLimitsPatchBody = {
  blog: {
    ban_forever?: boolean;
    ban_until?: string;
    max_per_period?: number | "";
    period?: PublishPeriod;
    min_interval_hours?: number | "";
  };
  micro: {
    ban_forever?: boolean;
    ban_until?: string;
    max_per_period?: number | "";
    period?: PublishPeriod;
    min_interval_hours?: number | "";
  };
  blog_comment: {
    ban_forever?: boolean;
    ban_until?: string;
    max_per_period?: number | "";
    period?: PublishPeriod;
    min_interval_hours?: number | "";
  };
  chat: {
    ban_forever?: boolean;
    ban_until?: string;
    max_per_period?: number | "";
    period?: PublishPeriod;
    min_interval_hours?: number | "";
  };
};

export async function patchAdminPublishLimits(
  token: string,
  userId: string,
  body: PublishLimitsPatchBody,
): Promise<{ ok: boolean; publish_limits: PublishLimitsPayload }> {
  return api(`/api/admin/users/${userId}/publish-limits`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export async function postAdminUserCoins(
  token: string,
  userId: string,
  amount: number,
): Promise<{ ok: boolean; coins: number }> {
  return api(`/api/admin/users/${userId}/coins`, {
    method: "POST",
    token,
    body: JSON.stringify({ amount }),
  });
}

export async function patchAdminUserProfile(
  token: string,
  userId: string,
  body: {
    nickname?: string;
    full_name?: string;
    website_url?: string;
    bio?: string;
    readme_md?: string;
    social_links?: { name: string; url: string }[];
    avatar_url?: string;
    new_password?: string;
  },
): Promise<{ ok: boolean }> {
  return api(`/api/admin/users/${userId}/profile`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export async function uploadAdminUserAvatar(
  token: string,
  userId: string,
  file: File,
): Promise<{ avatar_url: string }> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(`/api/admin/users/${userId}/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error("нет ответа от сервера: проверь, что сайт открыт по тому же адресу, куда настроен backend.");
    }
    throw e;
  }
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data && typeof data === "object" && "error" in data ? String((data as { error: string }).error) : "ошибка";
    throw new Error(err);
  }
  return data as { avatar_url: string };
}

export async function listAdminUserInvites(token: string, userId: string): Promise<AdminInviteRow[]> {
  return api(`/api/admin/users/${userId}/invites`, { token });
}

export async function deleteAdminUserInvite(token: string, userId: string, inviteId: string): Promise<{ ok: boolean }> {
  return api(`/api/admin/users/${userId}/invites/${inviteId}`, { method: "DELETE", token });
}
