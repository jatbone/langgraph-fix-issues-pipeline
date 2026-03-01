export { openDatabase, verifyDatabase, migrateDatabase } from "./connection.js";
export {
  claimNextIssue,
  markSuccess,
  markFailed,
  insertIssue,
} from "./queries.js";
export type { TIssueStatus, TIssueRow } from "../types.js";

import type Database from "better-sqlite3";
export type TDatabase = Database.Database;
