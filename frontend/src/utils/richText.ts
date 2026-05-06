export type Token =
  | { kind: "text"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "mention"; value: string }
  | { kind: "link"; href: string; label: string };

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/gi;
const TAG_RE = /(?:^|\s)(#[\p{L}\p{N}_]{2,40})/gu;
const MENTION_RE = /(?:^|\s)(@[A-Za-z0-9_]{3,32})/g;

export function tokenizeRich(input: string): Token[] {
  if (!input) return [];

  type Match = { start: number; end: number; token: Token };
  const matches: Match[] = [];

  let m: RegExpExecArray | null;

  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(input))) {
    const value = m[0];
    matches.push({
      start: m.index,
      end: m.index + value.length,
      token: { kind: "link", href: value, label: value },
    });
  }

  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(input))) {
    const tag = m[1];
    const start = m.index + (m[0].length - tag.length);
    matches.push({
      start,
      end: start + tag.length,
      token: { kind: "tag", value: tag.slice(1) },
    });
  }

  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(input))) {
    const mention = m[1];
    const start = m.index + (m[0].length - mention.length);
    matches.push({
      start,
      end: start + mention.length,
      token: { kind: "mention", value: mention.slice(1) },
    });
  }

  matches.sort((a, b) => a.start - b.start);

  const cleaned: Match[] = [];
  let last = -1;
  for (const x of matches) {
    if (x.start < last) continue;
    cleaned.push(x);
    last = x.end;
  }

  const out: Token[] = [];
  let cursor = 0;
  for (const x of cleaned) {
    if (x.start > cursor) {
      out.push({ kind: "text", value: input.slice(cursor, x.start) });
    }
    out.push(x.token);
    cursor = x.end;
  }
  if (cursor < input.length) out.push({ kind: "text", value: input.slice(cursor) });
  return out;
}
