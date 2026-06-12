export const PROFILE_WALLPAPER_STYLES = [
  { id: "1", label: "тема профиля 1" },
  { id: "2", label: "тема профиля 2" },
] as const;

export type ProfileWallpaperStyleId = (typeof PROFILE_WALLPAPER_STYLES)[number]["id"];

export function normalizeProfileWallpaperStyle(raw?: string | null): ProfileWallpaperStyleId {
  return String(raw ?? "1").trim() === "2" ? "2" : "1";
}
