/** активность за последние N мс считается «онлайн» */
export const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

export function isOnlineFromLastSeen(lastSeenAt) {
  if (!lastSeenAt) return false;
  const t = Date.parse(String(lastSeenAt));
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= ONLINE_THRESHOLD_MS;
}

/** null — пользователь скрыл статус; иначе { online: boolean } */
export function onlinePayload(lastSeenAt, showOnlineStatus) {
  if (!showOnlineStatus) return null;
  return { online: isOnlineFromLastSeen(lastSeenAt) };
}
