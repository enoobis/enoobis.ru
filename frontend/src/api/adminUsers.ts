import { api } from "./http";

export async function patchAdminUserProfile(
  token: string,
  userId: string,
  body: { bio?: string; avatar_url?: string; wallpaper_url?: string },
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
  const res = await fetch(`/api/admin/users/${userId}/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data && typeof data === "object" && "error" in data ? String((data as { error: string }).error) : "ошибка";
    throw new Error(err);
  }
  return data as { avatar_url: string };
}
