const LS = "enoobis.readerProgress";

type ProgressMap = Record<string, number>;

function readMap(): ProgressMap {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ProgressMap;
  } catch {
    return {};
  }
}

export function getReaderProgress(key: string): number | null {
  const n = readMap()[key];
  return typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

export function setReaderProgress(key: string, page: number) {
  if (!Number.isFinite(page) || page < 1) return;
  const map = readMap();
  map[key] = Math.floor(page);
  localStorage.setItem(LS, JSON.stringify(map));
}
