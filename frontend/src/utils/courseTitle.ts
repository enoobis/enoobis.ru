const SUFFIX = /^(ие|ия|ий|ый|ое|ая|ые|ами|ями|ах|ях|ом|ем|ой|ев|ов|ть|ти|ять|ить|ать|еть|ние|ции|ция|сть|ся|сь|и|е|я)$/i;

const GLUE = [
  "переопределение",
  "многопоточность",
  "асинхронность",
  "исключений",
  "перечисления",
  "операторов",
  "оператора",
  "оператор",
  "обработка",
  "расширения",
  "коллекции",
  "протоколом",
  "протокола",
  "файловой",
  "файловои",
  "системой",
  "системы",
  "обобщения",
  "matching",
  "generics",
  "pattern",
  "класса",
  "работа",
  "глава",
  "http",
].sort((a, b) => b.length - a.length);

const FAKE_NUM: Record<string, string> = { b: "6", в: "6", "/": "7" };

function hasBrokenBits(s: string): boolean {
  return /(?:^|[\s.])[а-яё](?:\s+[а-яёа-я]{1,2})+(?=[\s.]|$)/i.test(s)
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
      if (pieces.every((p) => SUFFIX.test(p)) && concat.length >= 5) take = k;
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
  const text = String(raw ?? "");
  if (!text) return "";
  return text.replace(/(```[\s\S]*?```)|(`[^`]+`)|([^`]+)/g, (all, fence, inline, prose) => {
    if (fence || inline) return all;
    return prose.replace(/[А-Яа-яЁё]+(?:[ \t]+[А-Яа-яЁё]+)*/g, joinRun);
  });
}

function splitGlued(s: string): string {
  const lower = s.toLowerCase();
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i += 1;
      continue;
    }
    if (s[i] === ".") {
      parts.push(".");
      i += 1;
      continue;
    }
    if (/\d/.test(s[i])) {
      const start = i;
      while (i < s.length && /\d/.test(s[i])) i += 1;
      parts.push(s.slice(start, i));
      continue;
    }
    const hit = GLUE.find((w) => w.length >= 4 && lower.startsWith(w, i));
    if (hit) {
      parts.push(s.slice(i, i + hit.length));
      i += hit.length;
      continue;
    }
    let j = i + 1;
    while (j < s.length && s[j] !== "." && !/\s/.test(s[j])) {
      if (GLUE.some((w) => w.length >= 4 && lower.startsWith(w, j))) break;
      if (/\d/.test(s[j])) break;
      j += 1;
    }
    parts.push(s.slice(i, j));
    i = j;
  }
  let out = "";
  for (const p of parts) {
    if (p === ".") {
      out += ".";
      continue;
    }
    if (!out) out = p;
    else if (out.endsWith(".")) out += ` ${p}`;
    else out += ` ${p}`;
  }
  return out.replace(/файловои/gi, "файловой").replace(/\s+/g, " ").trim();
}

export function prettyCourseTitle(raw: string): string {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/y(?=[а-яё])/gi, "у");
  if (/^глава/i.test(s)) {
    s = s.replace(/^глава(?=\S)/i, "глава ");
    s = s.replace(/^глава\s*([bв/])\./i, (_, ch: string) => `глава ${FAKE_NUM[ch] ?? ch}.`);
    s = s.replace(/^(глава\s+\d+)\.(?=\S)/i, "$1. ");
    const rest = s.replace(/^глава\s+\d+\.\s*/i, "");
    if (rest && !/\s/.test(rest)) return s.replace(rest, splitGlued(rest));
    return s;
  }
  if (!/\s/.test(s) && /[а-яё]{8,}/i.test(s)) return splitGlued(s);
  if (hasBrokenBits(s)) return healBrokenWords(s);
  return s;
}
