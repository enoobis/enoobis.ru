import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

/** меняется при смене внешнего вида — старые файлы перегенерируются на старте */
export const IDENTICON_VERSION = "v2";

const SIZE = 256;
const COLS = 5;
const ROWS = 5;
const UNIQUE_COLS = 3;
const FIELD = SIZE * 0.76;
const ORIGIN = (SIZE - FIELD) / 2;
const CELL = FIELD / COLS;
const CORNER = CELL * 0.42;
const OVERLAP = CELL * 0.04;
const FILL_CHANCE = 42;

function n(value) {
  return Math.round(value * 100) / 100;
}

function buildCells(hash) {
  const cells = [];
  for (let col = 0; col < UNIQUE_COLS; col++) {
    cells.push([]);
    for (let row = 0; row < ROWS; row++) {
      cells[col][row] = hash[col * ROWS + row] % 100 < FILL_CHANCE;
    }
  }

  // углы сетки выпадали бы за круг
  cells[0][0] = false;
  cells[0][ROWS - 1] = false;

  const filled = cells.reduce((sum, col) => sum + col.filter(Boolean).length, 0);
  if (filled < 5) {
    cells[0][2] = true;
    cells[1][1] = true;
    cells[2][0] = true;
    cells[2][3] = true;
  }
  return cells;
}

function roundedSquare(x, y, side, r) {
  return (
    `M${n(x + r)} ${n(y)}` +
    `H${n(x + side - r)}` +
    `a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}` +
    `V${n(y + side - r)}` +
    `a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}` +
    `H${n(x + r)}` +
    `a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}` +
    `V${n(y + r)}` +
    `a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}` +
    `Z`
  );
}

/**
 * все ячейки — подпути одного path с небольшим перекрытием:
 * заливка считается один раз, поэтому на стыках соседних ячеек нет швов от сглаживания
 */
function buildPath(cells) {
  const side = CELL + OVERLAP;
  let d = "";
  for (let col = 0; col < COLS; col++) {
    const source = col < UNIQUE_COLS ? col : COLS - 1 - col;
    for (let row = 0; row < ROWS; row++) {
      if (!cells[source][row]) continue;
      d += roundedSquare(
        ORIGIN + col * CELL - OVERLAP / 2,
        ORIGIN + row * CELL - OVERLAP / 2,
        side,
        CORNER,
      );
    }
  }
  return d;
}

export function buildIdenticonSvg(seed) {
  const hash = crypto.createHash("sha256").update(String(seed)).digest();
  const d = buildPath(buildCells(hash));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#000"/>` +
    `<path d="${d}" fill="#fff"/>` +
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
