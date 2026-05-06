import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

const SIZE = 128;
const GRID = 8;
const CELL = SIZE / GRID;
const HALF = GRID / 2;

export function buildIdenticonSvg(seed) {
  const src = String(seed) + ":" + Math.random() + ":" + Date.now();
  const hash = crypto.createHash("sha256").update(src).digest();

  const quad = [];
  for (let y = 0; y < HALF; y++) {
    quad.push([]);
    for (let x = 0; x < HALF; x++) {
      const idx = y * HALF + x;
      quad[y][x] = (hash[idx] & 1) === 1;
    }
  }

  const rects = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const sx = x < HALF ? x : GRID - 1 - x;
      const sy = y < HALF ? y : GRID - 1 - y;
      if (quad[sy][sx]) {
        rects.push(
          `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}" fill="#fff"/>`,
        );
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<rect width="${SIZE}" height="${SIZE}" fill="#000"/>` +
    rects.join("") +
    `</svg>`
  );
}

export function saveIdenticon(seed, userId) {
  const dir = path.resolve(process.env.UPLOADS_DIR ?? "./data/uploads", "avatars");
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${userId}-${uuidv4().replace(/-/g, "")}.svg`;
  const svg = buildIdenticonSvg(seed);
  fs.writeFileSync(path.join(dir, filename), svg, "utf8");
  return `/uploads/avatars/${filename}`;
}
