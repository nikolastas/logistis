import { Router } from "express";
import { dataSource } from "../db";
import { Transaction } from "../entities/Transaction";
import { getCategoryById, getCategories } from "../categorizer";
import {
  getSpendingByCategory,
  getSpendingByOwner,
  getSpendingByMonth,
  getSpendingByMonthAndCategory,
} from "../services/insightsService";

export const insightsRouter = Router();

insightsRouter.get("/categories", (_req, res) => {
  res.json(getCategories());
});

insightsRouter.get("/summary", async (_req, res) => {
  try {
    const repo = dataSource.getRepository(Transaction);
    const [all, expenses] = await Promise.all([
      repo.count(),
      repo
        .createQueryBuilder("t")
        .where("t.amount < 0")
        .getCount(),
    ]);
    res.json({ totalTransactions: all, expenseCount: expenses });
  } catch (err) {
    console.error("Summary:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

insightsRouter.get("/spending", async (req, res) => {
  try {
    const { from, to, householdId, userId } = req.query as {
      from?: string;
      to?: string;
      householdId?: string;
      userId?: string;
    };

    const repo = dataSource.getRepository(Transaction);
    const [byCategory, byOwner, byMonth, totalCount, expenseCount] = await Promise.all([
      getSpendingByCategory(from, to, householdId, userId),
      getSpendingByOwner(from, to, householdId, userId),
      getSpendingByMonth(from, to, householdId, userId),
      repo.count(),
      repo.createQueryBuilder("t").where("t.amount < 0").getCount(),
    ]);

    const byCategoryWithNames = byCategory.map((c) => ({
      ...c,
      categoryName: getCategoryById(c.categoryId)?.name ?? c.categoryId,
    }));

    res.json({
      byCategory: byCategoryWithNames,
      byOwner,
      byMonth,
      totalTransactions: totalCount,
      expenseCount,
    });
  } catch (err) {
    console.error("Insights:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

insightsRouter.get("/spending-by-month-category", async (req, res) => {
  try {
    const { year, householdId, userId } = req.query as {
      year?: string;
      householdId?: string;
      userId?: string;
    };
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    if (isNaN(y)) {
      res.status(400).json({ error: "Invalid year" });
      return;
    }

    const rows = await getSpendingByMonthAndCategory(
      y,
      householdId || undefined,
      userId
    );
    const withNames = rows.map((r) => ({
      ...r,
      categoryName: getCategoryById(r.categoryId)?.name ?? r.categoryId,
    }));

    res.json(withNames);
  } catch (err) {
    console.error("Spending by month/category:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});
