import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isChapterHeading, prettyCourseTitle } from "../src/utils/courseTitle.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, "..");
const SOURCE = path.resolve(
  process.env.COURSES_DUMP_DIR ?? path.join(BACKEND, "..", "..", "site", "мои курсы"),
);
const SEED_DIR = path.join(BACKEND, "seed", "courses");
const SEED_LECTURES = path.join(SEED_DIR, "lectures");
const SEED_IMAGES = path.join(SEED_DIR, "images");
const CODE_PREFIX = "MK-";
const MIN_LESSONS = 3;

const LANG = {
  py: "python",
  js: "javascript",
  ts: "typescript",
  cs: "csharp",
  csharp: "csharp",
  cpp: "cpp",
  c: "c",
  java: "java",
  kt: "kotlin",
  kotlin: "kotlin",
  go: "go",
  rs: "rust",
  rust: "rust",
  php: "php",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  xml: "xml",
  html: "html",
  css: "css",
  json: "json",
  swift: "swift",
  dart: "dart",
  vb: "vbnet",
  fs: "fsharp",
};

const IMAGE_EXT = {
  ".jpeg": ".jpg",
  ".png@v=1": ".png",
};

/* верхняя папка дампа = категория каталога курсов */
const CATEGORY = {
  ai: "ai",
  assembler: "ассемблер",
  c: "c",
  common: "общее",
  cpp: "c++",
  dart: "dart",
  f: "f#",
  go: "go",
  hosting: "хостинг",
  java: "java",
  js: "javascript",
  kotlin: "kotlin",
  nosql: "nosql",
  os: "операционные системы",
  php: "php",
  python: "python",
  rust: "rust",
  sharp: "c#",
  sql: "sql",
  swift: "swift",
  visualbasic: "visual basic",
  web: "веб",
};

function walkIndexFiles(dir, acc = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "pics" || e.name === "img" || e.name.startsWith(".")) continue;
      walkIndexFiles(full, acc);
    } else if (e.name.toLowerCase() === "index.html") {
      acc.push(full);
    }
  }
  return acc;
}

const NAMED_ENTITIES = {
  nbsp: " ",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  copy: "©",
  reg: "®",
  trade: "™",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  mdash: "—",
  ndash: "–",
  minus: "−",
  hellip: "…",
  middot: "·",
  bull: "•",
  times: "×",
  divide: "÷",
  deg: "°",
  plusmn: "±",
  sect: "§",
  para: "¶",
  euro: "€",
  pound: "£",
  rarr: "→",
  larr: "←",
  harr: "↔",
  infin: "∞",
  ne: "≠",
  le: "≤",
  ge: "≥",
};

function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&amp;/gi, "&");
}

function stripTags(html) {
  return decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// в дампе шуточного сайта бренд вставлен в идентификаторы через пробел: "com. enoobis"
function cleanBrand(s) {
  return maskDemoSecrets(String(s ?? ""))
    .replace(/сайт о программировании/gi, "")
    .replace(/https?:\/\/(?:www\.)?enoobis\.ru\S*/gi, "enoobis.ru")
    .replace(/([./_:"'([-])[ \t]+enoobis/g, "$1enoobis")
    .trim();
}

// демо-ключи из статей по формату выглядят как настоящие и блокируют push
function maskDemoSecrets(s) {
  return String(s ?? "")
    .replace(/\bAC[0-9a-f]{32}\b/g, "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
    .replace(/((?:Auth|Api|Secret)[A-Za-z]*(?:Token|Key|Sid)\s*=\s*")[0-9a-f]{32}(")/g, "$1xxx$2");
}

function fixCodeBrand(s) {
  return maskDemoSecrets(String(s ?? "").replace(/([./_:"'([-])[ \t]+enoobis/g, "$1enoobis"));
}

function lowerTitle(s) {
  return cleanBrand(s).replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

function slugFromRel(rel) {
  return rel
    .replace(/\\/g, "/")
    .replace(/\/index\.html$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function courseCode(rel) {
  const slug = slugFromRel(rel) || "course";
  const h = createHash("sha1").update(rel).digest("hex").slice(0, 4).toUpperCase();
  return `${CODE_PREFIX}${slug.slice(0, 8).toUpperCase()}${h}`.slice(0, 16);
}

function extractContentOl(html) {
  const start = html.search(/<ol\b[^>]*class="[^"]*\bcontent\b[^"]*"/i);
  if (start < 0) return "";
  const re = /<\/?ol\b/gi;
  re.lastIndex = start + 3;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (html[m.index + 1] === "/") depth -= 1;
    else depth += 1;
    if (depth === 0) return html.slice(start, m.index + 5);
  }
  return html.slice(start);
}

function parseToc(html) {
  const block = extractContentOl(html);
  if (!block) return [];
  const seen = new Set();
  const out = [];
  const re = /<a href="([^"]+\.php\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
  let chapter = "";
  let m;
  while ((m = re.exec(block))) {
    const href = m[1].replace(/\\/g, "/").split("#")[0];
    if (!href || /^(https?:)?\/\//i.test(href)) continue;
    const title = prettyCourseTitle(lowerTitle(stripTags(m[2])));
    if (!title) continue;
    if (isChapterHeading(title)) {
      chapter = title;
      continue;
    }
    if (seen.has(href)) {
      const prev = out.find((x) => x.href === href);
      if (prev) prev.title = title;
      continue;
    }
    seen.add(href);
    out.push({ href, title, chapter });
  }
  return out;
}

function indexTitle(html, fallback) {
  const h1 = html.match(/<div class="item center menC">[\s\S]*?<h1>([\s\S]*?)<\/h1>/i);
  if (h1) return lowerTitle(stripTags(h1[1]));
  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (title) return lowerTitle(stripTags(title[1]).split("|")[0]);
  return lowerTitle(fallback);
}

function extractArticle(html) {
  const start = html.search(/<div class="item center menC">/i);
  if (start < 0) return "";
  let chunk = html.slice(start);
  const nav = chunk.search(/<div class="nav">/i);
  if (nav > 0) chunk = chunk.slice(0, nav);
  else {
    const endSoc = chunk.lastIndexOf('<div class="socBlock">');
    if (endSoc > 200) chunk = chunk.slice(0, endSoc);
  }
  chunk = chunk.replace(/<h1>[\s\S]*?<\/h1>/i, "");
  chunk = chunk.replace(/<h2>[\s\S]*?<\/h2>/i, "");
  chunk = chunk.replace(/<div class="date">[\s\S]*?<\/div>/gi, "");
  chunk = chunk.replace(/<div class="socBlock">[\s\S]*?<\/div>\s*<\/div>/gi, "");
  chunk = chunk.replace(/<style[\s\S]*?<\/style>/gi, "");
  chunk = chunk.replace(/<!--[\s\S]*?-->/g, "");
  chunk = chunk.replace(/<div[^>]*id="yandex_rtb[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  chunk = chunk.replace(/<script[\s\S]*?<\/script>/gi, "");
  chunk = chunk.replace(/<header[\s\S]*?<\/header>/gi, "");
  chunk = chunk.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  chunk = chunk.replace(/<div[^>]*>\s*<\/div>/gi, "");
  return chunk;
}

function mapLang(raw) {
  const k = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]/g, "");
  return LANG[k] || k || "";
}

function htmlToMd(html, { dir, copyImage }) {
  let s = html;
  // код держим отдельно: иначе общая зачистка тегов съедает html-примеры внутри него
  const blocks = [];
  s = s.replace(/<pre([^>]*)>([\s\S]*?)<\/pre>/gi, (_m, attrs, code) => {
    const cls = String(attrs).match(/brush:([a-z0-9+#]+)/i);
    const lang = mapLang(cls?.[1] || String(attrs).match(/class="([^"]+)"/i)?.[1]);
    const body = decodeEntities(code.replace(/<\/?(span|b|i|em|strong|a|br|font)\b[^>]*>/gi, ""));
    blocks.push(`\`\`\`${lang}\n${fixCodeBrand(body).replace(/^\n+|\s+$/g, "")}\n\`\`\``);
    return `\n\n\u0000${blocks.length - 1}\u0000\n\n`;
  });
  s = s.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_m, inner) => {
    const rows = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
      [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        stripTags(c[1]).replace(/\|/g, "\\|"),
      ),
    );
    if (!rows.length || !rows[0].length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const line = (cells) =>
      `| ${Array.from({ length: width }, (_v, i) => cells[i] ?? "").join(" | ")} |`;
    const md = [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
    blocks.push(md);
    return `\n\n\u0000${blocks.length - 1}\u0000\n\n`;
  });
  s = s.replace(/<img\b([^>]*)>/gi, (_m, attrs) => {
    const src = String(attrs).match(/src="([^"]+)"/i)?.[1];
    if (!src) return "";
    if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return "";
    const alt = lowerTitle(String(attrs).match(/alt="([^"]*)"/i)?.[1] ?? "");
    const url = copyImage(dir, src.split("?")[0]);
    if (!url) return "";
    return `\n\n![${alt}](${url})\n\n`;
  });
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, t) => `\n\n### ${stripTags(t)}\n\n`);
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, t) => `\n\n## ${stripTags(t)}\n\n`);
  s = s.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_m, t) => `\n\n#### ${stripTags(t)}\n\n`);
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t) => {
    const codes = [];
    const inner = t
      .replace(/<p[^>]*>/gi, "")
      .replace(/<\/p>/gi, " ")
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_c, code) => ` \`${stripTags(code)}\` `)
      .replace(/\u0000(\d+)\u0000/g, (ph) => {
        codes.push(ph);
        return "";
      });
    const line = `\n- ${stripTags(inner)}`;
    /* внутри пункта списка fence не работает, поэтому код выносим за список */
    return codes.length ? `${line}\n\n${codes.join("\n\n")}\n\n` : line;
  });
  s = s.replace(/<\/?ul[^>]*>/gi, "\n");
  s = s.replace(/<\/?ol[^>]*>/gi, "\n");
  s = s.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, t) => {
    const text = stripTags(t);
    if (!text) return "";
    if (/^(https?:)?\/\//i.test(href) && !/enoobis/i.test(href)) return `[${text}](${href})`;
    return text;
  });
  s = s.replace(/<span class="b">([\s\S]*?)<\/span>/gi, (_m, t) => `**${stripTags(t)}**`);
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, t) => `\`${stripTags(t)}\``);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, t) => `\n\n${stripTags(t)}\n\n`);
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = cleanBrand(s);
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s
    .replace(/\u0000(\d+)\u0000/g, (_m, i) => blocks[Number(i)] ?? "")
    .replace(/\u0000/g, "");
}

const imageNames = new Map();

function copyImage(fromDir, rel) {
  const abs = path.resolve(fromDir, rel.replace(/\\/g, "/"));
  if (!abs.toLowerCase().startsWith(SOURCE.toLowerCase())) return "";
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return "";
  const cached = imageNames.get(abs);
  if (cached) return `/uploads/course-lectures/${cached}`;
  const buf = fs.readFileSync(abs);
  const raw = (path.extname(abs) || ".png").toLowerCase();
  const ext = IMAGE_EXT[raw] ?? raw;
  const name = `${createHash("sha1").update(buf).digest("hex")}${ext}`;
  fs.writeFileSync(path.join(SEED_IMAGES, name), buf);
  imageNames.set(abs, name);
  return `/uploads/course-lectures/${name}`;
}

function collectCourses() {
  const courses = [];
  for (const indexPath of walkIndexFiles(SOURCE)) {
    const html = fs.readFileSync(indexPath, "utf8");
    const lessons = parseToc(html);
    if (lessons.length < MIN_LESSONS) continue;
    const rel = path.relative(SOURCE, indexPath);
    const dir = path.dirname(indexPath);
    const title = indexTitle(html, path.basename(dir));
    if (!title) continue;
    const top = rel.replace(/\\/g, "/").split("/")[0].toLowerCase();
    const category = CATEGORY[top] ?? top;
    courses.push({ dir, rel, title, category, code: courseCode(rel), lessons });
  }
  return courses.sort((a, b) => a.code.localeCompare(b.code));
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`нет папки с дампом: ${SOURCE}`);
    process.exit(1);
  }
  fs.rmSync(SEED_DIR, { recursive: true, force: true });
  fs.mkdirSync(SEED_LECTURES, { recursive: true });
  fs.mkdirSync(SEED_IMAGES, { recursive: true });

  const index = [];
  let total = 0;
  for (const course of collectCourses()) {
    const lectures = [];
    for (const lesson of course.lessons) {
      const file = path.join(course.dir, lesson.href);
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, "utf8");
      const body = htmlToMd(extractArticle(raw), { dir: path.dirname(file), copyImage });
      const title =
        lesson.title ||
        lowerTitle(stripTags(raw.match(/<h2>([\s\S]*?)<\/h2>/i)?.[1] ?? ""));
      if (!title || !body) continue;
      lectures.push({
        title: prettyCourseTitle(title),
        chapter: prettyCourseTitle(lesson.chapter ?? ""),
        body,
      });
    }
    if (!lectures.length) continue;
    const lines = lectures.map((l) => JSON.stringify(l)).join(",\n  ");
    fs.writeFileSync(
      path.join(SEED_LECTURES, `${course.code}.json`),
      `{"code":${JSON.stringify(course.code)},"title":${JSON.stringify(course.title)},"category":${JSON.stringify(course.category)},"lectures":[\n  ${lines}\n]}\n`,
    );
    index.push({
      code: course.code,
      title: course.title,
      category: course.category,
      lectures: lectures.length,
    });
    total += lectures.length;
  }
  fs.writeFileSync(
    path.join(SEED_DIR, "index.json"),
    `[\n  ${index.map((i) => JSON.stringify(i)).join(",\n  ")}\n]\n`,
  );
  console.log(`курсов: ${index.length}, лекций: ${total}, картинок: ${imageNames.size}`);
}

main();
