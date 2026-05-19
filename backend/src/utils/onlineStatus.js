/** активность за последние N мс считается «онлайн» */
export const ONLINE_THRESHOLD_MS = 90 * 1000;

export function isOnlineFromLastSeen(lastSeenAt) {
  if (!lastSeenAt) return false;
  const t = Date.parse(String(lastSeenAt));
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= ONLINE_THRESHOLD_MS;
}

/** null — статус скрыт; иначе online + last_seen_at (если был в сети) */
export function onlinePayload(lastSeenAt, showOnlineStatus) {
  if (!showOnlineStatus) return null;
  const seen = lastSeenAt ? String(lastSeenAt) : null;
  return {
    online: isOnlineFromLastSeen(lastSeenAt),
    last_seen_at: seen,
  };
}
