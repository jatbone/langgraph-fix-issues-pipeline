import "dotenv/config";
import { openDatabase, migrateDatabase } from "@langgraph-fix-issues-pipeline/shared/db";

const db = openDatabase();
migrateDatabase(db);
console.log("Migration complete — issues table is ready.");
db.close();
