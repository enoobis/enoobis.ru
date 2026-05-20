export const THEMES = [
  { id: "black", label: "тёмная" },
  { id: "white", label: "светлая" },
  { id: "contrast", label: "контраст · тёмная" },
  { id: "contrast-white", label: "контраст · светлая" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

/** старые значения из бд */
const LEGACY: Record<string, ThemeId> = {
  graphite: "black",
};

export function normalizeThemeId(raw?: string | null): ThemeId {
  const v = String(raw ?? "black").trim();
  if (THEME_IDS.has(v)) return v as ThemeId;
  return LEGACY[v] ?? "black";
}

export function isLightTheme(theme: ThemeId): boolean {
  return theme === "white" || theme === "contrast-white";
}
