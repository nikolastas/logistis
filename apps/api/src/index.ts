import path from "path";
import { config } from "dotenv";
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env") });
import "reflect-metadata";
import { app } from "./app";
import { initDb } from "./db";

const PORT = process.env.PORT || 3001;

async function main() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`API running at http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
