import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { parseJsonLoose } from "./gemini.js";
import { optimizeUploadedFile } from "./imageOptimize.js";
import { perplexityEnabled, perplexitySearch } from "./perplexity.js";
import { UPLOAD_ROOT } from "./uploadSafe.js";

const DAILY_LIMIT = 3;
const NEWS_DIR = path.join(UPLOAD_ROOT, "news");
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SOURCE_HOSTS = new Set([
  "shazoo.ru",
  "www.shazoo.ru",
  "cdn.shazoo.ru",
  "ixbt.com",
  "www.ixbt.com",
  "3dnews.ru",
  "www.3dnews.ru",
  "playground.ru",
  "www.playground.ru",
]);

const GABE_SOURCE =
  "https://shazoo.ru/2026/08/20/189231/geib-niuell-porazil-fanatov-vnesnim-vidom-na-otkrytii-the-international-2026-po-dota-2";
const GABE_IMAGE = "https://cdn.shazoo.ru/c1200x630/880197_dnLI2ir_image.jpg";
const GABE_TITLE = "гейб на ти 2026 вышел другим";
const GABE_BODY = [
  "на открытии the international 2026 гейб ньюэлл снова вылез по видео. речь обычная, про 15 лет доты и имена на аегисе. народ смотрел не на это.",
  "он заметно похудел. на реддите уже мемы про нового чада гейба. кто-то скучает по толстому, остальные просто рады что выглядит живым.",
  "писал как будто с яхты, море за спиной. для габена это уже почти традиция.",
].join("\n\n");

const SYSTEM = [
  "ты редактор короткой ленты. пишешь как человек в чате, не как сми и не как ии.",
  "весь текст строчными. без списков, без заголовков внутри, без эмодзи, без длинного тире.",
  "без канцелярита, без «стоит отметить», без «это не просто».",
  "2-4 коротких абзаца на новость. факты оставь, воду выкинь.",
  "отвечай только json вида {\"items\":[{\"title\",\"body\",\"url\",\"image_url\"}]}.",
].join(" ");

let settledDay = "";
let ingesting = false;

export function newsDayKey(date = new Date()) {
  const tz = process.env.NEWS_TZ?.trim() || "Asia/Almaty";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function humanize(text) {
  return String(text ?? "")
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
    .replace(/\s*[—–]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isPrivateHost(hostname) {
  if (!hostname) return true;
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;
  if (hostname === "::1" || hostname === "[::1]") return true;
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname) || /^0\.0\.0\.0$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  return false;
}

function sourceNameFromUrl(url) {
  const host = hostOf(url).replace(/^www\./, "");
  if (host === "shazoo.ru" || host === "cdn.shazoo.ru") return "shazoo";
  if (host === "ixbt.com") return "ixbt";
  if (host === "3dnews.ru") return "3dnews";
  if (host === "playground.ru") return "playground";
  return host || "источник";
}

function isAllowedArticle(url) {
  const host = hostOf(url);
  return SOURCE_HOSTS.has(host) && !isPrivateHost(host);
}

function countForDay(day) {
  return get("SELECT COUNT(*) as v FROM news WHERE day = ?", day)?.v ?? 0;
}

function knownUrls() {
  return new Set(all("SELECT source_url FROM news").map((r) => r.source_url));
}

function extractOgImage(html) {
  const tagged = String(html ?? "");
  const a = tagged.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  );
  if (a?.[1]) return a[1];
  const b = tagged.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  );
  return b?.[1] ?? "";
}

async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "enoobis-news/1.0" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function downloadImage(imageUrl) {
  if (!imageUrl) return "";
  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
  if (isPrivateHost(parsed.hostname)) return "";

  fs.mkdirSync(NEWS_DIR, { recursive: true });
  const tmpName = `${uuidv4().replace(/-/g, "")}.bin`;
  const tmpAbs = path.join(NEWS_DIR, tmpName);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(parsed.href, {
      headers: { "User-Agent": "enoobis-news/1.0" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) return "";
    fs.writeFileSync(tmpAbs, buf);
    const optimized = await optimizeUploadedFile(tmpAbs, "news");
    const filename = optimized.filename;
    if (!fs.existsSync(path.join(NEWS_DIR, filename))) return "";
    return `/uploads/news/${filename}`;
  } catch {
    try {
      if (fs.existsSync(tmpAbs)) fs.unlinkSync(tmpAbs);
    } catch {
      /* ignore */
    }
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function resolveImage(articleUrl, hinted) {
  if (hinted) {
    const saved = await downloadImage(hinted);
    if (saved) return saved;
  }
  const html = await fetchPage(articleUrl);
  const og = extractOgImage(html);
  if (!og) return "";
  try {
    return await downloadImage(new URL(og, articleUrl).href);
  } catch {
    return "";
  }
}

function insertNews(row) {
  run(
    `INSERT INTO news (id, title, body, image_url, source_url, source_name, day, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.title,
    row.body,
    row.image_url,
    row.source_url,
    row.source_name,
    row.day,
    row.created_at,
  );
}

export async function seedGabeNews() {
  if (get("SELECT id FROM news WHERE source_url = ?", GABE_SOURCE)) return false;
  const imageUrl = await downloadImage(GABE_IMAGE);
  insertNews({
    id: uuidv4(),
    title: GABE_TITLE,
    body: GABE_BODY,
    image_url: imageUrl,
    source_url: GABE_SOURCE,
    source_name: "shazoo",
    day: "2026-08-20",
    created_at: "2026-08-20T16:20:00.000Z",
  });
  return true;
}

function parseItems(raw) {
  let data;
  try {
    data = parseJsonLoose(raw);
  } catch {
    const m = String(raw).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) return [];
    try {
      data = parseJsonLoose(m[0]);
    } catch {
      return [];
    }
  }
  const items = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      title: humanize(item?.title).toLowerCase().slice(0, 160),
      body: String(item?.body ?? "")
        .replace(/[—–]/g, " - ")
        .trim()
        .slice(0, 4000),
      url: String(item?.url ?? "").trim(),
      image_url: String(item?.image_url ?? "").trim(),
    }))
    .filter((item) => item.title && item.body && isAllowedArticle(item.url));
}

async function askPerplexity(need, skipUrls) {
  const skip = skipUrls.length
    ? `уже были, не повторяй:\n${skipUrls.slice(-40).join("\n")}`
    : "";
  const raw = await perplexitySearch({
    system: SYSTEM,
    recency: "week",
    user: [
      `найди ${need} действительно интересные новости за последние дни.`,
      "темы: железо пк, роботы, ардуино, 3д принтеры, игры, valve, стим, габен, телефоны, наушники.",
      "только shazoo, ixbt, 3dnews, playground.ru.",
      "не бери очередной «представили модель» без истории. нужен поворот, странный ход, скандал, большой сдвиг.",
      "перескажи своими словами, коротко, как другу.",
      "url должен быть прямой ссылкой на статью. image_url - главное фото со страницы, если есть.",
      skip,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return parseItems(raw);
}

/**
 * @param {{ force?: boolean, limit?: number }} [opts]
 */
export async function ingestDailyNews(opts = {}) {
  const day = newsDayKey();
  const already = countForDay(day);
  const need = Math.max(0, (opts.limit ?? DAILY_LIMIT) - already);
  if (!need) {
    settledDay = day;
    return { day, added: 0, skipped: "full" };
  }
  if (!opts.force && settledDay === day) {
    return { day, added: 0, skipped: "settled" };
  }
  if (!perplexityEnabled()) {
    return { day, added: 0, skipped: "no_key" };
  }

  const seen = knownUrls();
  let candidates = [];
  try {
    candidates = await askPerplexity(need, [...seen]);
  } catch (e) {
    console.warn("news ingest:", e?.message ?? e);
    return { day, added: 0, skipped: e?.message ?? "failed" };
  }

  let added = 0;
  for (const item of candidates) {
    if (added >= need) break;
    if (seen.has(item.url)) continue;
    const imageUrl = await resolveImage(item.url, item.image_url);
    insertNews({
      id: uuidv4(),
      title: item.title,
      body: item.body,
      image_url: imageUrl,
      source_url: item.url,
      source_name: sourceNameFromUrl(item.url),
      day,
      created_at: nowIso(),
    });
    seen.add(item.url);
    added += 1;
  }

  settledDay = day;
  if (added) console.log(`news ingest: +${added} for ${day}`);
  return { day, added, skipped: added ? "" : "none" };
}

export async function seedAndIngestNews() {
  try {
    await seedGabeNews();
  } catch (e) {
    console.warn("news seed warn:", e?.message ?? e);
  }
  try {
    await ingestDailyNews();
  } catch (e) {
    console.warn("news ingest warn:", e?.message ?? e);
  }
}

export function scheduleNewsIngest() {
  const tick = () => {
    if (ingesting) return;
    ingesting = true;
    void seedAndIngestNews().finally(() => {
      ingesting = false;
    });
  };
  tick();
  const timer = setInterval(tick, 60 * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
}
