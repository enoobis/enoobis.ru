const WORDS = [
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
  "и",
  "с",
].sort((a, b) => b.length - a.length);

const FAKE_NUM = { b: "6", в: "6", "/": "7" };

function splitGlued(s) {
  const lower = s.toLowerCase();
  const parts = [];
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
    const hit = WORDS.find((w) => lower.startsWith(w, i));
    if (hit) {
      parts.push(s.slice(i, i + hit.length));
      i += hit.length;
      continue;
    }
    let j = i + 1;
    while (j < s.length && s[j] !== "." && !/\s/.test(s[j])) {
      if (WORDS.some((w) => lower.startsWith(w, j))) break;
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

export function prettyCourseTitle(raw) {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/^глава(?=\S)/i, "глава ");
  s = s.replace(/^глава\s*([bв/])\./i, (_, ch) => `глава ${FAKE_NUM[ch] ?? ch}.`);
  return splitGlued(s);
}

export function isChapterHeading(title) {
  return /^глава\s+\d/i.test(prettyCourseTitle(title));
}
