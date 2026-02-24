import { In } from "typeorm";
import { Router } from "express";
import { dataSource } from "../db";
import { Transaction } from "../entities/Transaction";

export const transactionsRouter = Router();

transactionsRouter.get("/", async (req, res) => {
  try {
    const { from, to, category, userId, householdId, description, amountMin, amountMax, transferType } =
      req.query;
    const qb = dataSource.getRepository(Transaction).createQueryBuilder("t");

    if (from) qb.andWhere("t.date >= :from", { from });
    if (to) qb.andWhere("t.date <= :to", { to });
    if (category) qb.andWhere("t.categoryId = :category", { category });
    if (userId === "__shared__" || userId === "shared") {
      qb.andWhere("t.userId IS NULL");
    } else if (userId) {
      qb.andWhere("t.userId = :userId", { userId });
    }
    if (householdId) qb.andWhere("(t.householdId = :householdId OR t.householdId IS NULL)", { householdId });
    if (transferType === "transfers") {
      qb.andWhere("t.categoryId LIKE 'transfer/%'");
    }
    if (description && String(description).trim()) {
      qb.andWhere("t.description ILIKE :description", {
        description: `%${String(description).trim()}%`,
      });
    }
    if (amountMin != null && amountMin !== "") {
      const min = parseFloat(String(amountMin));
      if (!isNaN(min)) qb.andWhere("t.amount >= :amountMin", { amountMin: min });
    }
    if (amountMax != null && amountMax !== "") {
      const max = parseFloat(String(amountMax));
      if (!isNaN(max)) qb.andWhere("t.amount <= :amountMax", { amountMax: max });
    }

    const list = await qb.orderBy("t.date", "DESC").addOrderBy("t.createdAt", "DESC").getMany();

    res.json(list);
  } catch (err) {
    console.error("List transactions:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list" });
  }
});

transactionsRouter.delete("/bulk", async (req, res) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) {
      res.status(400).json({ error: "ids array required" });
      return;
    }

    const repo = dataSource.getRepository(Transaction);
    const result = await repo.delete({ id: In(ids) });

    res.json({ deleted: result.affected ?? ids.length });
  } catch (err) {
    console.error("Bulk delete:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Bulk delete failed" });
  }
});

transactionsRouter.patch("/bulk", async (req, res) => {
  try {
    const { ids, categoryId, userId, isExcludedFromAnalytics, countAsExpense } =
      req.body as {
        ids: string[];
        categoryId?: string;
        userId?: string | null;
        isExcludedFromAnalytics?: boolean;
        countAsExpense?: boolean;
      };
    if (!ids?.length) {
      res.status(400).json({ error: "ids array required" });
      return;
    }

    const repo = dataSource.getRepository(Transaction);
    const txList = await repo.find({ where: { id: In(ids) } });
    if (userId !== undefined) {
      const excluded = txList.filter(
        (t) => t.isExcludedFromAnalytics && t.categoryId === "transfer/own-account"
      );
      if (excluded.length > 0) {
        res.status(400).json({ error: "Own-account transfers cannot be tagged to a user." });
        return;
      }
    }

    const updates: Partial<{
      categoryId: string;
      userId: string | null;
      isExcludedFromAnalytics: boolean;
      countAsExpense: boolean;
    }> = {};
    if (categoryId != null) updates.categoryId = categoryId;
    if (userId !== undefined) updates.userId = userId;
    if (isExcludedFromAnalytics !== undefined) updates.isExcludedFromAnalytics = isExcludedFromAnalytics;
    if (countAsExpense !== undefined) updates.countAsExpense = countAsExpense;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({
        error:
          "At least one of categoryId, userId, isExcludedFromAnalytics, countAsExpense required",
      });
      return;
    }

    const result = await repo
      .createQueryBuilder()
      .update(Transaction)
      .set(updates)
      .whereInIds(ids)
      .execute();

    res.json({ updated: result.affected ?? ids.length });
  } catch (err) {
    console.error("Bulk update:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Bulk update failed" });
  }
});

transactionsRouter.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, userId, transferCounterpartyUserId, isExcludedFromAnalytics, countAsExpense } =
      req.body;

    const repo = dataSource.getRepository(Transaction);
    const t = await repo.findOne({ where: { id } });
    if (!t) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    if (userId !== undefined && t.isExcludedFromAnalytics && t.categoryId === "transfer/own-account") {
      res.status(400).json({ error: "Own-account transfers cannot be tagged to a user." });
      return;
    }

    if (categoryId != null) t.categoryId = categoryId;
    if (userId !== undefined) t.userId = userId;
    if (transferCounterpartyUserId !== undefined) t.transferCounterpartyUserId = transferCounterpartyUserId;
    if (isExcludedFromAnalytics !== undefined) t.isExcludedFromAnalytics = isExcludedFromAnalytics;
    if (countAsExpense !== undefined) t.countAsExpense = countAsExpense;

    await repo.save(t);
    res.json(t);
  } catch (err) {
    console.error("Update transaction:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});
