import { api } from "./http";

export type ShopAvatar = {
  id: string;
  name: string;
  url: string;
  price: number;
  is_animated: number;
  owned: boolean;
};

export type OwnedAvatar = {
  id: string;
  name: string;
  url: string;
  price: number;
  is_animated: number;
  acquired_at: string;
};

export function listShopAvatars(token: string): Promise<ShopAvatar[]> {
  return api("/api/shop/avatars", { token });
}

export function listMyAvatars(token: string): Promise<OwnedAvatar[]> {
  return api("/api/shop/my-avatars", { token });
}

export function buyAvatar(token: string, avatarId: string): Promise<{ ok: boolean; coins: number }> {
  return api(`/api/shop/avatars/${avatarId}/buy`, { method: "POST", token });
}

export function equipAvatar(token: string, avatarId: string): Promise<{ ok: boolean; avatar_url: string }> {
  return api(`/api/shop/avatars/${avatarId}/equip`, { method: "POST", token });
}

export async function uploadWallpaper(token: string, file: File): Promise<{ wallpaper_url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/me/wallpaper", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? "upload error");
  }
  return res.json();
}

export async function deleteWallpaper(token: string): Promise<void> {
  await api("/api/me/wallpaper", { method: "DELETE", token });
}

export async function adminUploadShopAvatar(
  token: string,
  file: File,
  name: string,
  price: number,
): Promise<{ ok: boolean; url: string; name: string; price: number; is_animated: number }> {
  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  form.append("price", String(price));
  const res = await fetch("/api/admin/shop/avatars", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? "upload error");
  }
  return res.json();
}

export function adminDeleteShopAvatar(token: string, avatarId: string): Promise<{ ok: boolean }> {
  return api(`/api/admin/shop/avatars/${avatarId}`, { method: "DELETE", token });
}
