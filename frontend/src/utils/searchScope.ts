const PAGE_FILTER_PREFIXES = [
  "/blogs",
  "/microblogs",
  "/library",
  "/courses",
  "/leaderboard",
] as const;

export function pathUsesPageSearchFilter(path: string) {
  return PAGE_FILTER_PREFIXES.some((prefix) => path.startsWith(prefix));
}
