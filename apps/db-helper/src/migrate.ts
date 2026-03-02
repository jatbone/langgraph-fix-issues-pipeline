import "dotenv/config";
import { openDatabase, migrateDatabase } from "@langgraph-fix-issues-pipeline/backend";

const db = openDatabase();
migrateDatabase(db);
console.log("Migration complete — issues table is ready.");
db.close();
