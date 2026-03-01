import "dotenv/config";
import { openDatabase, verifyDatabase, insertIssue } from "@langgraph-fix-issues-pipeline/shared/db";

const title = "Example issue title";
const body = "Describe the issue in detail here.";

const db = openDatabase();
verifyDatabase(db);
const row = insertIssue(db, title, body);
console.log("Inserted issue:", row);
db.close();
