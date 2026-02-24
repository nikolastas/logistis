import { dataSource } from "../db";
import { BudgetPlan } from "../entities/BudgetPlan";
import { BudgetItem } from "../entities/BudgetItem";
import { Household } from "../entities/Household";
import { User } from "../entities/User";
import { Transaction } from "../entities/Transaction";
import { getSharedExpenseSplit } from "./incomeService";

type BudgetItemType = "income" | "expense";

export interface BudgetItemInput {
  userId: string | null;
  name: string;
  amount: number;
  type: BudgetItemType;
  categoryId: string;
}

export interface BudgetSummary {
  household: {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    savingsTarget: number;
  };
  users: Array<{
    userId: string;
    nickname: string;
    income: number;
    personalExpenses: number;
    sharedExpenseShare: number;
    pct: number;
    savingsTarget: number;
    freeMoney: number;
  }>;
  shared: { totalExpenses: number };
}

export interface BudgetComparison {
  items: Array<{
    budgetItemId: string;
    name: string;
    categoryId: string;
    userId: string | null;
    planned: number;
    actual: number;
    difference: number;
  }>;
  totalPlanned: number;
  totalActual: number;
  totalDifference: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function keyFor(userId: string | null, categoryId: string): string {
  return `${userId ?? "__shared__"}::${categoryId}`;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

function monthRange(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const from = `${month}-01`;
  const to = new Date(year, mon, 0).toISOString().slice(0, 10);
  return { from, to };
}

export async function listBudgetPlans(householdId: string): Promise<
  Array<{
    id: string;
    householdId: string;
    month: string;
    savingsTarget: number | null;
    status: "draft" | "active" | "closed";
    notes: string | null;
    itemCount: number;
    totalPlanned: number;
    createdAt: Date;
    updatedAt: Date;
  }>
> {
  const rows = await dataSource
    .getRepository(BudgetPlan)
    .createQueryBuilder("bp")
    .leftJoin("budget_items", "bi", `bi."budgetPlanId" = bp.id`)
    .select("bp.id", "id")
    .addSelect(`bp."householdId"`, "householdId")
    .addSelect("bp.month", "month")
    .addSelect(`bp."savingsTarget"`, "savingsTarget")
    .addSelect("bp.status", "status")
    .addSelect("bp.notes", "notes")
    .addSelect(`bp."createdAt"`, "createdAt")
    .addSelect(`bp."updatedAt"`, "updatedAt")
    .addSelect("COUNT(bi.id)", "itemCount")
    .addSelect(
      `COALESCE(SUM(CASE WHEN bi.type = 'expense' THEN bi.amount ELSE 0 END), 0)`,
      "totalPlanned"
    )
    .where(`bp."householdId" = :householdId`, { householdId })
    .groupBy("bp.id")
    .addGroupBy(`bp."householdId"`)
    .addGroupBy("bp.month")
    .addGroupBy(`bp."savingsTarget"`)
    .addGroupBy("bp.status")
    .addGroupBy("bp.notes")
    .addGroupBy(`bp."createdAt"`)
    .addGroupBy(`bp."updatedAt"`)
    .orderBy("bp.month", "DESC")
    .getRawMany();

  return rows.map((r) => ({
    id: r.id,
    householdId: r.householdId,
    month: r.month,
    savingsTarget: r.savingsTarget != null ? toNumber(r.savingsTarget) : null,
    status: r.status,
    notes: r.notes ?? null,
    itemCount: parseInt(r.itemCount, 10) || 0,
    totalPlanned: round2(toNumber(r.totalPlanned)),
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  }));
}

export async function getBudgetPlanOrThrow(
  householdId: string,
  budgetPlanId: string
): Promise<BudgetPlan> {
  const plan = await dataSource.getRepository(BudgetPlan).findOne({
    where: { id: budgetPlanId, householdId },
    relations: ["items"],
    order: { items: { createdAt: "ASC" } },
  });
  if (!plan) {
    throw new Error("Budget plan not found");
  }
  return plan;
}

export async function createBudgetPlan(
  householdId: string,
  month: string,
  savingsTarget?: number | null,
  notes?: string | null
): Promise<BudgetPlan> {
  const repo = dataSource.getRepository(BudgetPlan);
  const plan = repo.create({
    householdId,
    month,
    savingsTarget: savingsTarget ?? null,
    notes: notes ?? null,
    status: "draft",
  });
  return repo.save(plan);
}

export async function updateBudgetPlan(
  plan: BudgetPlan,
  patch: Partial<{
    month: string;
    savingsTarget: number | null;
    status: "draft" | "active" | "closed";
    notes: string | null;
  }>
): Promise<BudgetPlan> {
  if (patch.month !== undefined) plan.month = patch.month;
  if (patch.savingsTarget !== undefined) plan.savingsTarget = patch.savingsTarget;
  if (patch.status !== undefined) plan.status = patch.status;
  if (patch.notes !== undefined) plan.notes = patch.notes;
  return dataSource.getRepository(BudgetPlan).save(plan);
}

export async function addBudgetItem(
  plan: BudgetPlan,
  input: BudgetItemInput
): Promise<BudgetItem> {
  const itemRepo = dataSource.getRepository(BudgetItem);
  const item = itemRepo.create({
    budgetPlanId: plan.id,
    userId: input.userId,
    name: input.name,
    amount: input.amount,
    type: input.type,
    categoryId: input.categoryId,
  });
  return itemRepo.save(item);
}

export async function updateBudgetItem(
  item: BudgetItem,
  patch: Partial<BudgetItemInput>
): Promise<BudgetItem> {
  if (patch.userId !== undefined) item.userId = patch.userId;
  if (patch.name !== undefined) item.name = patch.name;
  if (patch.amount !== undefined) item.amount = patch.amount;
  if (patch.type !== undefined) item.type = patch.type;
  if (patch.categoryId !== undefined) item.categoryId = patch.categoryId;
  return dataSource.getRepository(BudgetItem).save(item);
}

export async function getBudgetSummary(plan: BudgetPlan): Promise<BudgetSummary> {
  const household = await dataSource
    .getRepository(Household)
    .findOne({ where: { id: plan.householdId } });
  const users = await dataSource
    .getRepository(User)
    .find({ where: { householdId: plan.householdId } });

  const items = plan.items ?? [];
  const totalIncome = items
    .filter((i) => i.type === "income")
    .reduce((s, i) => s + toNumber(i.amount), 0);
  const totalExpenses = items
    .filter((i) => i.type === "expense")
    .reduce((s, i) => s + toNumber(i.amount), 0);

  const defaultSavingsTarget = household?.defaultSavingsTarget != null
    ? toNumber(household.defaultSavingsTarget)
    : 0;
  const savingsTarget = plan.savingsTarget != null
    ? toNumber(plan.savingsTarget)
    : defaultSavingsTarget;

  const sharedExpenses = items
    .filter((i) => i.type === "expense" && i.userId == null)
    .reduce((s, i) => s + toNumber(i.amount), 0);
  const sharedIncome = items
    .filter((i) => i.type === "income" && i.userId == null)
    .reduce((s, i) => s + toNumber(i.amount), 0);

  const split = await getSharedExpenseSplit(plan.householdId);
  const fallbackPct = users.length > 0 ? 1 / users.length : 0;

  const perUser = users.map((u) => {
    const pct = split[u.id] ?? fallbackPct;
    const personalIncome = items
      .filter((i) => i.type === "income" && i.userId === u.id)
      .reduce((s, i) => s + toNumber(i.amount), 0);
    const personalExpenses = items
      .filter((i) => i.type === "expense" && i.userId === u.id)
      .reduce((s, i) => s + toNumber(i.amount), 0);

    const allocatedSharedIncome = sharedIncome * pct;
    const sharedExpenseShare = sharedExpenses * pct;
    const userSavingsTarget = savingsTarget * pct;
    const income = personalIncome + allocatedSharedIncome;
    const freeMoney = income - personalExpenses - sharedExpenseShare - userSavingsTarget;

    return {
      userId: u.id,
      nickname: u.nickname,
      income: round2(income),
      personalExpenses: round2(personalExpenses),
      sharedExpenseShare: round2(sharedExpenseShare),
      pct: round2(pct),
      savingsTarget: round2(userSavingsTarget),
      freeMoney: round2(freeMoney),
    };
  });

  return {
    household: {
      totalIncome: round2(totalIncome),
      totalExpenses: round2(totalExpenses),
      balance: round2(totalIncome - totalExpenses - savingsTarget),
      savingsTarget: round2(savingsTarget),
    },
    users: perUser,
    shared: { totalExpenses: round2(sharedExpenses) },
  };
}

export async function getBudgetComparison(plan: BudgetPlan): Promise<BudgetComparison> {
  const items = plan.items ?? [];
  const { from, to } = monthRange(plan.month);

  const actualRows = await dataSource
    .getRepository(Transaction)
    .createQueryBuilder("t")
    .select(`t."userId"`, "userId")
    .addSelect(`t."categoryId"`, "categoryId")
    .addSelect(
      `COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0)`,
      "expenseActual"
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0)`,
      "incomeActual"
    )
    .where(`t."householdId" = :householdId`, { householdId: plan.householdId })
    .andWhere("t.date >= :from", { from })
    .andWhere("t.date <= :to", { to })
    .andWhere(`(t."isExcludedFromAnalytics" = false OR t."isExcludedFromAnalytics" IS NULL)`)
    .groupBy(`t."userId"`)
    .addGroupBy(`t."categoryId"`)
    .getRawMany();

  const actualMap = new Map<
    string,
    { expenseActual: number; incomeActual: number }
  >();
  for (const row of actualRows) {
    actualMap.set(keyFor(row.userId ?? null, row.categoryId), {
      expenseActual: toNumber(row.expenseActual),
      incomeActual: toNumber(row.incomeActual),
    });
  }

  const resultItems = items.map((item) => {
    const key = keyFor(item.userId ?? null, item.categoryId);
    const actual = actualMap.get(key);
    const planned = toNumber(item.amount);
    const actualValue =
      item.type === "expense" ? (actual?.expenseActual ?? 0) : (actual?.incomeActual ?? 0);
    return {
      budgetItemId: item.id,
      name: item.name,
      categoryId: item.categoryId,
      userId: item.userId ?? null,
      planned: round2(planned),
      actual: round2(actualValue),
      difference: round2(actualValue - planned),
    };
  });

  const totalPlanned = resultItems.reduce((s, i) => s + i.planned, 0);
  const totalActual = resultItems.reduce((s, i) => s + i.actual, 0);

  return {
    items: resultItems,
    totalPlanned: round2(totalPlanned),
    totalActual: round2(totalActual),
    totalDifference: round2(totalActual - totalPlanned),
  };
}
