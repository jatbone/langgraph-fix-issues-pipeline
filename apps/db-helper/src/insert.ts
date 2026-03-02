import "dotenv/config";
import { openDatabase, verifyDatabase, insertIssue } from "@langgraph-fix-issues-pipeline/backend";

const title = "";
const body = "";

if (!title || !body) {
  throw new Error("Both title and body must be set before running this script.");
}

const db = openDatabase();
verifyDatabase(db);
const row = insertIssue(db, title, body);
console.log("Inserted issue:", row);
db.close();
