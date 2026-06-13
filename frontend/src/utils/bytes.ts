export function fmtUsed(bytes: number) {
  const v = Math.max(0, Math.floor(Number(bytes) || 0));
  if (v >= 1024 ** 3 * 0.05) return `${(v / 1024 ** 3).toFixed(2)} гб`;
  if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(1)} мб`;
  if (v >= 1024) return `${(v / 1024).toFixed(1)} кб`;
  return `${v} б`;
}

export function fmtBytes(n: number) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v < 1024) return `${v} б`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} кб`;
  if (v < 1024 ** 3 * 0.05) return `${(v / 1024 / 1024).toFixed(1)} мб`;
  return `${(v / 1024 ** 3).toFixed(2)} гб`;
}

export function fmtQuotaGb(bytes: number) {
  const gb = bytes / 1024 ** 3;
  return Number.isInteger(gb) ? `${gb} гб` : `${gb.toFixed(1)} гб`;
}
