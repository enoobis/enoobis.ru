import { api } from "./http";

export type ShopItemKind = "avatar" | "frame" | "wallpaper" | "cover";

export type ShopCategory = {
  id: string;
  name: string;
  sort_order?: number;
};

export type ShopItem = {
  id: string;
  kind: ShopItemKind;
  categories: ShopCategory[];
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
  categories: ShopCategory[];
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
};

export function listShopCategories(token: string): Promise<ShopCategory[]> {
  return api("/api/shop/categories", { token });
}

export type ShopItemsPage = {
  items: ShopItem[];
  page: number;
  page_size: number;
  total: number;
};

export const SHOP_PAGE_SIZE = 24;

export function listShopItems(token: string, kind?: ShopItemKind, category?: string): Promise<ShopItem[]> {
  const qs = new URLSearchParams();
  if (kind) qs.set("kind", kind);
  if (category) qs.set("category", category);
  const q = qs.toString() ? `?${qs}` : "";
  return api(`/api/shop/items${q}`, { token });
}

export function listShopItemsPage(
  token: string,
  opts: { kind: ShopItemKind; category?: string; page?: number },
): Promise<ShopItemsPage> {
  const qs = new URLSearchParams();
  qs.set("kind", opts.kind);
  qs.set("page", String(Math.max(1, opts.page ?? 1)));
  qs.set("page_size", String(SHOP_PAGE_SIZE));
  if (opts.category) qs.set("category", opts.category);
  return api(`/api/shop/items?${qs}`, { token });
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

export function deleteOwnedShopItem(token: string, itemId: string): Promise<EquipResult> {
  return api(`/api/shop/my-items/${itemId}`, { method: "DELETE", token });
}

export type ImageShopKind = ShopItemKind;

export async function adminUploadShopItem(
  token: string,
  file: File,
  kind: ImageShopKind,
  name: string,
  price: number,
  stockLimit?: number | null,
  categoryIds?: string[],
): Promise<ShopItem & { ok: boolean }> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  form.append("name", name);
  form.append("price", String(price));
  if (stockLimit != null && stockLimit >= 1) form.append("stock_limit", String(stockLimit));
  if (categoryIds?.length) form.append("categories", JSON.stringify(categoryIds));
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

export function adminListShopCategories(token: string): Promise<ShopCategory[]> {
  return api("/api/admin/shop/categories", { token });
}

export function adminCreateShopCategory(
  token: string,
  id: string,
  name: string,
): Promise<ShopCategory> {
  return api("/api/admin/shop/categories", {
    method: "POST",
    token,
    body: JSON.stringify({ id, name }),
  });
}

export function adminUpdateShopCategory(
  token: string,
  id: string,
  name: string,
): Promise<ShopCategory> {
  return api(`/api/admin/shop/categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ name }),
  });
}

export function adminDeleteShopCategory(token: string, id: string): Promise<{ ok: boolean }> {
  return api(`/api/admin/shop/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
}

export function adminPatchShopItem(
  token: string,
  itemId: string,
  payload: {
    kind?: ShopItemKind;
    categories?: string[];
    name?: string;
    price?: number;
    stock_limit?: number | null;
  },
): Promise<{ ok: boolean; item: ShopItem }> {
  return api(`/api/admin/shop/items/${itemId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function adminDeleteShopItem(token: string, itemId: string): Promise<{ ok: boolean }> {
  return api(`/api/admin/shop/items/${itemId}`, { method: "DELETE", token });
}
