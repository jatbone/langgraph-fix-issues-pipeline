/**
 * SQLite database connection and migration helpers.
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const findMonorepoRoot = (from: string): string => {
  let dir = from;
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return from;
};

const DEFAULT_DB_PATH = resolve(findMonorepoRoot(process.cwd()), "data/issues.db");

/**
 * Opens a SQLite connection with WAL mode enabled.
 * Auto-creates the parent directory if it doesn't exist.
 */
export const openDatabase = (path?: string): Database.Database => {
  const dbPath = path ?? process.env.DATABASE_PATH ?? DEFAULT_DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
};

/**
 * Checks that the `issues` table exists. Throws a descriptive error if missing.
 */
export const verifyDatabase = (db: Database.Database): void => {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='issues'",
    )
    .get() as { name: string } | undefined;

  if (!row) {
    throw new Error("Issues table not found. Run pnpm db:migrate first.");
  }
};

/**
 * Creates the `issues` table if it doesn't exist.
 */
export const migrateDatabase = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS issues (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      body            TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'open',
      claimed_at      TEXT NULL,
      finished_at     TEXT NULL,
      result_summary  TEXT NULL,
      pr_url          TEXT NULL,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    )
  `);
};
