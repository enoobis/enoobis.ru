import { api } from "./http";

export type ShopItemKind =
  | "avatar"
  | "frame"
  | "wallpaper"
  | "cover"
  | "font"
  | "ink"
  | "accent"
  | "radius";

/** вкладка магазина: `ui` — шрифт, текст, акцент, углы */
export type ShopListKind = ShopItemKind | "ui";

export type ShopItem = {
  id: string;
  kind: ShopItemKind;
  name: string;
  url: string;
  price: number;
  is_animated: number;
  stock_limit: number | null;
  sold_count: number;
  preset_value: string | null;
  owned: boolean;
};

export type OwnedShopItem = {
  id: string;
  kind: ShopItemKind;
  name: string;
  url: string;
  price: number;
  is_animated: number;
  acquired_at: string;
  preset_value: string | null;
};

export type EquipResult = {
  ok: boolean;
  avatar_url: string;
  wallpaper_url: string;
  avatar_frame_url: string;
  profile_cover_url: string;
  ui_font_slug: string;
  ui_ink_hex: string;
  ui_accent_hex: string;
  ui_radius_slug: string;
};

export function listShopItems(token: string, kind?: ShopListKind): Promise<ShopItem[]> {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return api(`/api/shop/items${q}`, { token });
}

export function listShopAvatars(token: string): Promise<ShopItem[]> {
  return api("/api/shop/avatars", { token });
}

export function listMyShopItems(token: string): Promise<OwnedShopItem[]> {
  return api("/api/shop/my-items", { token });
}

export function listMyAvatars(token: string): Promise<OwnedShopItem[]> {
  return api("/api/shop/my-avatars", { token });
}

export function buyShopItem(token: string, itemId: string): Promise<{ ok: boolean; coins: number }> {
  return api(`/api/shop/items/${itemId}/buy`, { method: "POST", token });
}

export function buyAvatar(token: string, avatarId: string): Promise<{ ok: boolean; coins: number }> {
  return api(`/api/shop/avatars/${avatarId}/buy`, { method: "POST", token });
}

export function equipShopItem(token: string, itemId: string): Promise<EquipResult> {
  return api(`/api/shop/items/${itemId}/equip`, { method: "POST", token });
}

export function equipAvatar(token: string, avatarId: string): Promise<EquipResult> {
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

export async function adminUploadShopItem(
  token: string,
  file: File,
  kind: ImageShopKind,
  name: string,
  price: number,
  stockLimit?: number | null,
): Promise<{
  ok: boolean;
  id: string;
  url: string;
  name: string;
  price: number;
  kind: string;
  is_animated: number;
  stock_limit: number | null;
}> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  form.append("name", name);
  form.append("price", String(price));
  if (stockLimit != null && stockLimit >= 1) form.append("stock_limit", String(stockLimit));
  const res = await fetch("/api/admin/shop/items", {
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

export type PresetShopKind = "font" | "ink" | "accent" | "radius";

export type ImageShopKind = Extract<ShopItemKind, "avatar" | "frame" | "wallpaper" | "cover">;

export function adminPostShopPresetItem(
  token: string,
  body: {
    kind: PresetShopKind;
    name: string;
    price: number;
    preset_value: string;
    stock_limit?: number | null;
  },
): Promise<{
  ok: boolean;
  id: string;
  url: string;
  name: string;
  price: number;
  kind: string;
  is_animated: number;
  stock_limit: number | null;
  preset_value: string;
}> {
  return api("/api/admin/shop/preset-item", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function adminDeleteShopItem(token: string, itemId: string): Promise<{ ok: boolean }> {
  return api(`/api/admin/shop/items/${itemId}`, { method: "DELETE", token });
}
