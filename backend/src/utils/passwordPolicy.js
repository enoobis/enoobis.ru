/**
 * @param {string} password
 * @returns {string | null} error code or null if ok
 */
export function passwordPolicyError(password) {
  const p = String(password ?? "");
  if (p.length < 10) return "password_too_short";
  if (p.length > 256) return "password_too_long";
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) return "password_too_weak";
  return null;
}
