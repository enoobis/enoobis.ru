import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_FILE ?? "./edu.db";
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

export function nowIso() {
  return new Date().toISOString();
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}
