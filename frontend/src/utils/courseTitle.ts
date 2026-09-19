import { COURSE_TITLE_WORDS as WORDS } from "./courseTitleWords";

const SUFFIX = /^(ие|ия|ий|ый|ое|ая|ые|ами|ями|ах|ях|ом|ем|ой|ев|ов|ть|ти|ять|ить|ать|еть|ние|ции|ция|сть|ся|сь|и|е|я)$/i;
const FAKE_NUM: Record<string, string> = { b: "6", в: "6", "/": "7" };

function hasBrokenBits(s: string): boolean {
  return /(?:^|[\s.])[а-яё](?:\s+[а-яё]{1,2})+(?=[\s.]|$)/i.test(s)
    || /[а-яё]{4,}\s+(ие|ия|ять|ить|ать|еть|и|е|я)(?:\s|$|[.,!?])/i.test(s);
}

function joinRun(run: string): string {
  if (!hasBrokenBits(run)) return run;
  const words = run.split(/[ \t]+/);
  if (words.length < 2) return run;
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    let take = 1;
    let concat = words[i];
    const max = Math.min(6, words.length - i);
    for (let k = 2; k <= max; k += 1) {
      concat += words[i + k - 1];
      const pieces = words.slice(i + 1, i + k);
      if (pieces.every((p) => SUFFIX.test(p)) && concat.length >= 5) {
        const prevOk = WORDS.has(words[i].toLowerCase());
        const nextOk = Boolean(words[i + k] && WORDS.has(words[i + k].toLowerCase()));
        const glueAnd = pieces.length === 1 && /^[ис]$/i.test(pieces[0]) && prevOk && nextOk;
        if (!glueAnd) take = k;
      }
      if (
        /^[св]$/i.test(words[i]) &&
        k >= 3 &&
        pieces[0].length >= 4 &&
        pieces.slice(1).every((p) => SUFFIX.test(p)) &&
        concat.length >= 6
      ) {
        take = k;
      }
    }
    out.push(words.slice(i, i + take).join(""));
    i += take;
  }
  return out.join(" ");
}

export function healBrokenWords(raw: string): string {
  const text = String(raw ?? "").replace(/y(?=[а-яё])/gi, "у");
  if (!text) return "";
  return text.replace(/(```[\s\S]*?```)|(`[^`]+`)|([^`]+)/g, (all, fence, inline, prose) => {
    if (fence || inline) return all;
    return prose.replace(/[А-Яа-яЁё]+(?:[ \t]+[А-Яа-яЁё]+)*/g, joinRun);
  });
}

function segmentToken(token: string): string {
  let t = token;
  const low0 = t.toLowerCase();
  if (t.length >= 5 && low0[0] === low0[1] && WORDS.has(low0.slice(1))) t = t.slice(1);
  const low = t.toLowerCase();
  if (WORDS.has(low) || t.length < 6) return t;
  const parts: string[] = [];
  let i = 0;
  while (i < t.length) {
    let best = 0;
    for (let j = t.length; j > i; j -= 1) {
      const w = low.slice(i, j);
      const min = w === "и" || w === "с" ? 1 : 2;
      if (j - i >= min && WORDS.has(w)) {
        best = j - i;
        break;
      }
    }
    if (!best) return token;
    parts.push(t.slice(i, i + best));
    i += best;
  }
  return parts.length > 1 ? parts.join(" ") : t;
}

export function prettyCourseTitle(raw: string): string {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/y(?=[а-яё])/gi, "у");
  s = s.replace(/^глава(?=\S)/i, "глава ");
  s = s.replace(/^глава\s*([bв/])\./i, (_, ch: string) => `глава ${FAKE_NUM[ch] ?? ch}.`);
  s = s.replace(/^(глава\s+\d+)\.(?=\S)/i, "$1. ");
  s = s.replace(/[А-Яа-яЁё]{6,}/g, segmentToken);
  if (hasBrokenBits(s)) s = healBrokenWords(s);
  return s.replace(/\s+/g, " ").trim();
}
