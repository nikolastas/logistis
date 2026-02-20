import path from "path";
import { config } from "dotenv";
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env") });
import "reflect-metadata";
import { initDb } from "./index";

async function migrate() {
  await initDb();
  console.log("Database synchronized.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
