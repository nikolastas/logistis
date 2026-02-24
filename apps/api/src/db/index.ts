import { DataSource } from "typeorm";
import { Transaction } from "../entities/Transaction";
import { Category } from "../entities/Category";
import { SavingsGoal } from "../entities/SavingsGoal";
import { Household } from "../entities/Household";
import { User } from "../entities/User";
import { Income } from "../entities/Income";
import { PerkCard } from "../entities/PerkCard";
import { IncomePerkCard } from "../entities/IncomePerkCard";
import { BudgetPlan } from "../entities/BudgetPlan";
import { BudgetItem } from "../entities/BudgetItem";
import { AddHouseholdUserIncome1739900000000 } from "./migrations/1739900000000-AddHouseholdUserIncome";
import { AddHouseholdDefaultSplit1740000000000 } from "./migrations/1740000000000-AddHouseholdDefaultSplit";
import { AddTransferColumns1740100000000 } from "./migrations/1740100000000-AddTransferColumns";
import { UserNameAliases1740200000000 } from "./migrations/1740200000000-UserNameAliases";
import { UserExpenseShare1740300000000 } from "./migrations/1740300000000-UserExpenseShare";
import { PerkCardEntity1740400000000 } from "./migrations/1740400000000-PerkCardEntity";
import { TransactionRefactor1740500000000 } from "./migrations/1740500000000-TransactionRefactor";
import { BudgetPlanning1740600000000 } from "./migrations/1740600000000-BudgetPlanning";

export let dataSource: DataSource;

export async function initDb(): Promise<void> {
  dataSource = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/couple_finance",
    synchronize: true,
    logging: process.env.NODE_ENV === "development",
    entities: [
      Transaction,
      Category,
      SavingsGoal,
      Household,
      User,
      Income,
      PerkCard,
      IncomePerkCard,
      BudgetPlan,
      BudgetItem,
    ],
    migrations: [
      AddHouseholdUserIncome1739900000000,
      AddHouseholdDefaultSplit1740000000000,
      AddTransferColumns1740100000000,
      UserNameAliases1740200000000,
      UserExpenseShare1740300000000,
      PerkCardEntity1740400000000,
      TransactionRefactor1740500000000,
      BudgetPlanning1740600000000,
    ],
    migrationsRun: process.env.NODE_ENV !== "production",
  });

  await dataSource.initialize();
}
