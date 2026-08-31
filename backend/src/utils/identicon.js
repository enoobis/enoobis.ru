import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

/** меняется при смене внешнего вида — старые файлы перегенерируются на старте */
export const IDENTICON_VERSION = "v3";

const SIZE = 256;
const DOT = 44;
const GRID = [34, 96, 160, 222];
const MIN_RIBBON_POINTS = 4;

/** углы решётки не влезают в круглую аватарку */
function isCorner(col, row) {
  return (col === 0 || col === 3) && (row === 0 || row === 3);
}

const POINTS = [];
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 4; col++) {
    if (isCorner(col, row)) continue;
    POINTS.push({ col, row, x: GRID[col], y: GRID[row] });
  }
}

const NEIGHBOURS = POINTS.map((p) =>
  POINTS.reduce((acc, other, index) => {
    if (other === p) return acc;
    if (Math.abs(other.col - p.col) > 1) return acc;
    if (Math.abs(other.row - p.row) > 1) return acc;
    acc.push(index);
    return acc;
  }, []),
);

function n(value) {
  return Math.round(value * 100) / 100;
}

/** поток байтов из seed: детерминированный и не кончается */
function makeRng(seed) {
  let bytes = crypto.createHash("sha256").update(String(seed)).digest();
  let cursor = 0;
  let round = 0;
  return function next(max) {
    if (cursor >= bytes.length) {
      round += 1;
      bytes = crypto.createHash("sha256").update(`${seed}:${round}`).digest();
      cursor = 0;
    }
    return bytes[cursor++] % max;
  };
}

function pick(rng, list) {
  return list[rng(list.length)];
}

/** резкие развороты дают колючий зигзаг вместо текучей ленты */
function turnCost(prev, from, to) {
  if (prev === null) return 0;
  const ax = POINTS[from].col - POINTS[prev].col;
  const ay = POINTS[from].row - POINTS[prev].row;
  const bx = POINTS[to].col - POINTS[from].col;
  const by = POINTS[to].row - POINTS[from].row;
  const dot = ax * bx + ay * by;
  const len = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return len === 0 ? 0 : -dot / len;
}

function buildChains(rng) {
  const used = new Set();
  const chains = [];
  const wanted = 2;

  for (let attempt = 0; attempt < wanted; attempt++) {
    const free = POINTS.map((_, i) => i).filter((i) => !used.has(i));
    if (!free.length) break;

    const chain = [pick(rng, free)];
    used.add(chain[0]);

    const length = 2 + rng(3);
    while (chain.length < length) {
      const from = chain[chain.length - 1];
      const prev = chain.length > 1 ? chain[chain.length - 2] : null;
      const open = NEIGHBOURS[from].filter((i) => !used.has(i));
      if (!open.length) break;

      const soft = open.filter((i) => turnCost(prev, from, i) < 0.1);
      const next = pick(rng, soft.length ? soft : open);
      chain.push(next);
      used.add(next);
    }

    if (chain.length > 1) chains.push(chain);
  }

  return { chains, used };
}

/** catmull-rom → безье: лента идёт через точки плавно, без изломов */
function chainPath(indexes) {
  const pts = indexes.map((i) => POINTS[i]);
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    d +=
      `C${n(p1.x + (p2.x - p0.x) / 6)} ${n(p1.y + (p2.y - p0.y) / 6)}` +
      ` ${n(p2.x - (p3.x - p1.x) / 6)} ${n(p2.y - (p3.y - p1.y) / 6)}` +
      ` ${n(p2.x)} ${n(p2.y)}`;
  }
  return d;
}

/** круглый конец обводки даёт кружок, поэтому точки и ленты — один и тот же path */
function dotPath(point) {
  return `M${n(point.x)} ${n(point.y)}l0.01 0`;
}

function buildPath(seed) {
  const rng = makeRng(seed);
  let { chains, used } = buildChains(rng);

  if (chains.reduce((sum, c) => sum + c.length, 0) < MIN_RIBBON_POINTS) {
    ({ chains, used } = buildChains(makeRng(`${seed}:retry`)));
  }

  let d = chains.map(chainPath).join("");
  POINTS.forEach((point, index) => {
    if (!used.has(index)) d += dotPath(point);
  });
  return d;
}

export function buildIdenticonSvg(seed) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#000"/>` +
    `<path d="${buildPath(seed)}" fill="none" stroke="#fff" stroke-width="${DOT}"` +
    ` stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

export function isCurrentIdenticon(url) {
  return String(url).includes(`-${IDENTICON_VERSION}-`);
}

export function saveIdenticon(seed, userId) {
  const dir = path.resolve(process.env.UPLOADS_DIR ?? "./data/uploads", "avatars");
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${userId}-${IDENTICON_VERSION}-${uuidv4().replace(/-/g, "")}.svg`;
  fs.writeFileSync(path.join(dir, filename), buildIdenticonSvg(seed), "utf8");
  return `/uploads/avatars/${filename}`;
}
