import { Router } from "express";
import { dataSource } from "../db";
import { Transaction } from "../entities/Transaction";
import { getCategoryById, getCategories } from "../categorizer";
import {
  getSpendingByCategory,
  getSpendingByOwner,
  getSpendingByMonth,
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
    const { from, to, householdId } = req.query as { from?: string; to?: string; householdId?: string };

    const repo = dataSource.getRepository(Transaction);
    const [byCategory, byOwner, byMonth, totalCount, expenseCount] = await Promise.all([
      getSpendingByCategory(from, to),
      getSpendingByOwner(from, to, householdId),
      getSpendingByMonth(from, to),
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
