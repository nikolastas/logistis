import { DataSource } from "typeorm";
import { Transaction } from "../entities/Transaction";
import { Category } from "../entities/Category";
import { SavingsGoal } from "../entities/SavingsGoal";
import { Household } from "../entities/Household";
import { User } from "../entities/User";
import { Income } from "../entities/Income";
import { AddHouseholdUserIncome1739900000000 } from "./migrations/1739900000000-AddHouseholdUserIncome";
import { AddHouseholdDefaultSplit1740000000000 } from "./migrations/1740000000000-AddHouseholdDefaultSplit";
import { AddTransferColumns1740100000000 } from "./migrations/1740100000000-AddTransferColumns";

export let dataSource: DataSource;

export async function initDb(): Promise<void> {
  dataSource = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/couple_finance",
    synchronize: true,
    logging: process.env.NODE_ENV === "development",
    entities: [Transaction, Category, SavingsGoal, Household, User, Income],
    migrations: [AddHouseholdUserIncome1739900000000, AddHouseholdDefaultSplit1740000000000, AddTransferColumns1740100000000],
    migrationsRun: process.env.NODE_ENV !== "production",
  });

  await dataSource.initialize();
}
