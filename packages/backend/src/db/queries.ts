/**
 * Issue CRUD operations for the SQLite issues table.
 */

import type Database from "better-sqlite3";
import type { TIssueRow } from "../types.js";

/**
 * Atomically claims the next open issue (oldest first).
 * Returns the claimed row, or undefined if none available.
 */
export const claimNextIssue = (db: Database.Database): TIssueRow | undefined => {
  const stmt = db.prepare(`
    UPDATE issues
    SET status = 'claimed',
        claimed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = (
      SELECT id FROM issues WHERE status = 'open' ORDER BY created_at ASC LIMIT 1
    )
    RETURNING *
  `);
  return stmt.get() as TIssueRow | undefined;
};

/**
 * Marks an issue as successfully completed.
 */
export const markSuccess = (
  db: Database.Database,
  id: number,
  summary: string,
  prUrl: string | null,
): void => {
  db.prepare(`
    UPDATE issues
    SET status = 'success',
        finished_at = datetime('now'),
        result_summary = ?,
        pr_url = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(summary, prUrl, id);
};

/**
 * Marks an issue as failed.
 */
export const markFailed = (
  db: Database.Database,
  id: number,
  reason: string,
): void => {
  db.prepare(`
    UPDATE issues
    SET status = 'failed',
        finished_at = datetime('now'),
        result_summary = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(reason, id);
};

/**
 * Inserts a new issue into the database.
 */
export const insertIssue = (
  db: Database.Database,
  title: string,
  body: string,
): TIssueRow => {
  const stmt = db.prepare(`
    INSERT INTO issues (title, body) VALUES (?, ?) RETURNING *
  `);
  return stmt.get(title, body) as TIssueRow;
};
