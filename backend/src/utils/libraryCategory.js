export const LIBRARY_CATEGORY_MAX = 40;

// тема живёт в самой книге, поэтому один смысл легко расходится
// на несколько строк: регистр, пробелы, точка, невидимые символы
export function normalizeLibraryCategory(raw) {
  return String(raw ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^["«»„“”']+|["«»„“”']+$/gu, "")
    .replace(/[.,;:!?]+$/u, "")
    .trim()
    .toLowerCase();
}

export function mergeLibraryCategoryCounts(rows) {
  const merged = new Map();
  for (const row of rows) {
    const category = normalizeLibraryCategory(row.category);
    if (!category || category.length > LIBRARY_CATEGORY_MAX) continue;
    merged.set(category, (merged.get(category) ?? 0) + Number(row.count ?? 0));
  }
  return [...merged.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "ru"))
    .map(([category, count]) => ({ category, count }));
}
