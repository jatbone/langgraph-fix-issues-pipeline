export { openDatabase, verifyDatabase, migrateDatabase } from "./db.js";
export {
  claimNextIssue,
  markSuccess,
  markFailed,
  insertIssue,
} from "./issues.js";
export type { TIssueStatus, TIssueRow } from "../issue.js";

import type Database from "better-sqlite3";
export type TDatabase = Database.Database;
