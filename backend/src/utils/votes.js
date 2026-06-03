import { get, nowIso, run } from "../db.js";
import { assertVoteTarget } from "./sqlAllowlist.js";

export function voteSummary(table, idColumn, id, viewerId) {
  assertVoteTarget(table, idColumn);
  const up =
    get(`SELECT COUNT(*) as v FROM ${table} WHERE ${idColumn} = ? AND vote = 1`, id)?.v ?? 0;
  const down =
    get(`SELECT COUNT(*) as v FROM ${table} WHERE ${idColumn} = ? AND vote = -1`, id)?.v ?? 0;
  let my_vote = null;
  if (viewerId) {
    const row = get(
      `SELECT vote FROM ${table} WHERE ${idColumn} = ? AND user_id = ?`,
      id,
      viewerId,
    );
    if (row) my_vote = Number(row.vote) === -1 ? -1 : 1;
  }
  return { up_count: up, down_count: down, my_vote };
}

export function applyVote({ table, idColumn, userIdColumn, id, userId, vote }) {
  assertVoteTarget(table, idColumn);
  const existing = get(
    `SELECT vote FROM ${table} WHERE ${idColumn} = ? AND ${userIdColumn} = ?`,
    id,
    userId,
  );
  if (existing && Number(existing.vote) === vote) {
    run(`DELETE FROM ${table} WHERE ${idColumn} = ? AND ${userIdColumn} = ?`, id, userId);
    return { removed: true };
  }
  run(
    `INSERT INTO ${table} (${userIdColumn}, ${idColumn}, vote, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(${userIdColumn}, ${idColumn}) DO UPDATE SET vote = excluded.vote, created_at = excluded.created_at`,
    userId,
    id,
    vote,
    nowIso(),
  );
  return { removed: false };
}
