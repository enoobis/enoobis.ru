/** подпись «был в сети …» для отображения офлайн-статуса */
export function formatLastSeen(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  if (diff < 60) return "был только что";
  if (diff < 3600) return `был ${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `был ${Math.floor(diff / 3600)} ч назад`;
  if (diff < 86400 * 2) return "был вчера";
  if (diff < 86400 * 7) return `был ${Math.floor(diff / 86400)} д назад`;
  return `был ${iso.slice(0, 10)}`;
}
