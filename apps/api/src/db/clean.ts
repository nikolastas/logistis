import path from "path";
import { config } from "dotenv";
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env") });
import "reflect-metadata";
import { initDb, dataSource } from "./index";
import { Transaction } from "../entities/Transaction";

async function clean() {
  await initDb();
  const result = await dataSource
    .createQueryBuilder()
    .delete()
    .from(Transaction)
    .execute();
  console.log(`Deleted ${result.affected ?? 0} transactions.`);
  process.exit(0);
}

clean().catch((err) => {
  console.error(err);
  process.exit(1);
});
