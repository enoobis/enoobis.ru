const NICKNAME_RE = /^[A-Za-z0-9_.]{3,24}$/;

/**
 * @param {unknown} n
 * @returns {boolean}
 */
export function isValidNickname(n) {
  return NICKNAME_RE.test(String(n ?? "").trim());
}

export const NICKNAME_RULE_TEXT = "3-24 chars: letters, digits, _ and .";
