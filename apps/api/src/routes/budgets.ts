import { Router } from "express";
import { dataSource } from "../db";
import { Household } from "../entities/Household";
import { User } from "../entities/User";
import { Category } from "../entities/Category";
import { BudgetPlan } from "../entities/BudgetPlan";
import { BudgetItem } from "../entities/BudgetItem";
import {
  addBudgetItem,
  createBudgetPlan,
  getBudgetComparison,
  getBudgetPlanOrThrow,
  getBudgetSummary,
  listBudgetPlans,
  updateBudgetItem,
  updateBudgetPlan,
} from "../services/budgetService";

export const budgetsRouter = Router({ mergeParams: true });

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATUS_SET = new Set(["draft", "active", "closed"]);
const TYPE_SET = new Set(["income", "expense"]);

async function ensureHousehold(hid: string): Promise<Household | null> {
  return dataSource.getRepository(Household).findOne({ where: { id: hid } });
}

async function ensureUserInHousehold(
  householdId: string,
  userId: string | null
): Promise<boolean> {
  if (!userId) return true;
  const user = await dataSource.getRepository(User).findOne({
    where: { id: userId, householdId },
  });
  return !!user;
}

async function ensureCategory(categoryId: string): Promise<boolean> {
  const category = await dataSource
    .getRepository(Category)
    .findOne({ where: { id: categoryId } });
  return !!category;
}

budgetsRouter.get("/", async (req, res) => {
  try {
    const { hid } = req.params as { hid: string };
    const household = await ensureHousehold(hid);
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    const plans = await listBudgetPlans(hid);
    res.json(plans);
  } catch (err) {
    console.error("List budgets:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list budgets" });
  }
});

budgetsRouter.post("/", async (req, res) => {
  try {
    const { hid } = req.params as { hid: string };
    const { month, savingsTarget, notes } = req.body as {
      month?: string;
      savingsTarget?: number | null;
      notes?: string | null;
    };
    const household = await ensureHousehold(hid);
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    if (!month || typeof month !== "string" || !MONTH_REGEX.test(month)) {
      res.status(400).json({ error: "month is required in YYYY-MM format" });
      return;
    }
    if (
      savingsTarget !== undefined &&
      savingsTarget !== null &&
      (typeof savingsTarget !== "number" || Number.isNaN(savingsTarget) || savingsTarget < 0)
    ) {
      res.status(400).json({ error: "savingsTarget must be a non-negative number" });
      return;
    }

    const existing = await dataSource
      .getRepository(BudgetPlan)
      .findOne({ where: { householdId: hid, month } });
    if (existing) {
      res.status(409).json({ error: "A budget plan for this month already exists" });
      return;
    }

    const created = await createBudgetPlan(
      hid,
      month,
      savingsTarget,
      typeof notes === "string" ? notes.trim() || null : null
    );
    const withItems = await getBudgetPlanOrThrow(hid, created.id);
    res.status(201).json(withItems);
  } catch (err) {
    console.error("Create budget plan:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create budget plan" });
  }
});

budgetsRouter.get("/:bid", async (req, res) => {
  try {
    const { hid, bid } = req.params as { hid: string; bid: string };
    const household = await ensureHousehold(hid);
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    const plan = await getBudgetPlanOrThrow(hid, bid);
    res.json(plan);
  } catch (err) {
    if (err instanceof Error && err.message === "Budget plan not found") {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error("Get budget plan:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get budget plan" });
  }
});

budgetsRouter.put("/:bid", async (req, res) => {
  try {
    const { hid, bid } = req.params as { hid: string; bid: string };
    const { month, savingsTarget, status, notes } = req.body as {
      month?: string;
      savingsTarget?: number | null;
      status?: "draft" | "active" | "closed";
      notes?: string | null;
    };

    const household = await ensureHousehold(hid);
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    const plan = await getBudgetPlanOrThrow(hid, bid);

    if (month !== undefined) {
      if (typeof month !== "string" || !MONTH_REGEX.test(month)) {
        res.status(400).json({ error: "month must be in YYYY-MM format" });
        return;
      }
      if (month !== plan.month) {
        const conflict = await dataSource
          .getRepository(BudgetPlan)
          .findOne({ where: { householdId: hid, month } });
        if (conflict) {
          res.status(409).json({ error: "A budget plan for this month already exists" });
          return;
        }
      }
    }
    if (
      savingsTarget !== undefined &&
      savingsTarget !== null &&
      (typeof savingsTarget !== "number" || Number.isNaN(savingsTarget) || savingsTarget < 0)
    ) {
      res.status(400).json({ error: "savingsTarget must be a non-negative number" });
      return;
    }
    if (status !== undefined && !STATUS_SET.has(status)) {
      res.status(400).json({ error: "status must be one of draft, active, closed" });
      return;
    }

    const updated = await updateBudgetPlan(plan, {
      month,
      savingsTarget,
      status,
      notes: notes === undefined ? undefined : typeof notes === "string" ? notes.trim() || null : null,
    });
    const withItems = await getBudgetPlanOrThrow(hid, updated.id);
    res.json(withItems);
  } catch (err) {
    if (err instanceof Error && err.message === "Budget plan not found") {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error("Update budget plan:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update budget plan" });
  }
});

budgetsRouter.delete("/:bid", async (req, res) => {
  try {
    const { hid, bid } = req.params as { hid: string; bid: string };
    const household = await ensureHousehold(hid);
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    const repo = dataSource.getRepository(BudgetPlan);
    const existing = await repo.findOne({ where: { id: bid, householdId: hid } });
    if (!existing) {
      res.status(404).json({ error: "Budget plan not found" });
      return;
    }
    await repo.delete(existing.id);
    res.status(204).send();
  } catch (err) {
    console.error("Delete budget plan:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete budget plan" });
  }
});

budgetsRouter.post("/:bid/items", async (req, res) => {
  try {
    const { hid, bid } = req.params as { hid: string; bid: string };
    const { userId, name, amount, type, categoryId } = req.body as {
      userId?: string | null;
      name?: string;
      amount?: number;
      type?: "income" | "expense";
      categoryId?: string;
    };

    const household = await ensureHousehold(hid);
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    const plan = await getBudgetPlanOrThrow(hid, bid);
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (typeof amount !== "number" || Number.isNaN(amount) || amount < 0) {
      res.status(400).json({ error: "amount must be a non-negative number" });
      return;
    }
    if (!type || !TYPE_SET.has(type)) {
      res.status(400).json({ error: "type must be income or expense" });
      return;
    }
    if (!categoryId || typeof categoryId !== "string") {
      res.status(400).json({ error: "categoryId is required" });
      return;
    }
    if (!(await ensureCategory(categoryId))) {
      res.status(400).json({ error: "categoryId is not valid" });
      return;
    }
    const normalizedUserId = userId ?? null;
    if (!(await ensureUserInHousehold(hid, normalizedUserId))) {
      res.status(400).json({ error: "userId must belong to this household" });
      return;
    }

    const item = await addBudgetItem(plan, {
      userId: normalizedUserId,
      name: name.trim(),
      amount,
      type,
      categoryId,
    });
    res.status(201).json(item);
  } catch (err) {
    if (err instanceof Error && err.message === "Budget plan not found") {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error("Create budget item:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create budget item" });
  }
});

budgetsRouter.put("/:bid/items/:iid", async (req, res) => {
  try {
    const { hid, bid, iid } = req.params as { hid: string; bid: string; iid: string };
    const { userId, name, amount, type, categoryId } = req.body as {
      userId?: string | null;
      name?: string;
      amount?: number;
      type?: "income" | "expense";
      categoryId?: string;
    };

    const household = await ensureHousehold(hid);
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    await getBudgetPlanOrThrow(hid, bid);
    const itemRepo = dataSource.getRepository(BudgetItem);
    const item = await itemRepo.findOne({ where: { id: iid, budgetPlanId: bid } });
    if (!item) {
      res.status(404).json({ error: "Budget item not found" });
      return;
    }
    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      res.status(400).json({ error: "name must be a non-empty string" });
      return;
    }
    if (amount !== undefined && (typeof amount !== "number" || Number.isNaN(amount) || amount < 0)) {
      res.status(400).json({ error: "amount must be a non-negative number" });
      return;
    }
    if (type !== undefined && !TYPE_SET.has(type)) {
      res.status(400).json({ error: "type must be income or expense" });
      return;
    }
    if (categoryId !== undefined) {
      if (!categoryId || typeof categoryId !== "string") {
        res.status(400).json({ error: "categoryId must be a non-empty string" });
        return;
      }
      if (!(await ensureCategory(categoryId))) {
        res.status(400).json({ error: "categoryId is not valid" });
        return;
      }
    }
    if (userId !== undefined && !(await ensureUserInHousehold(hid, userId ?? null))) {
      res.status(400).json({ error: "userId must belong to this household" });
      return;
    }

    const updated = await updateBudgetItem(item, {
      userId: userId === undefined ? undefined : userId ?? null,
      name: name === undefined ? undefined : name.trim(),
      amount,
      type,
      categoryId,
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message === "Budget plan not found") {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error("Update budget item:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update budget item" });
  }
});

budgetsRouter.delete("/:bid/items/:iid", async (req, res) => {
  try {
    const { hid, bid, iid } = req.params as { hid: string; bid: string; iid: string };
    const household = await ensureHousehold(hid);
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    await getBudgetPlanOrThrow(hid, bid);
    const itemRepo = dataSource.getRepository(BudgetItem);
    const item = await itemRepo.findOne({ where: { id: iid, budgetPlanId: bid } });
    if (!item) {
      res.status(404).json({ error: "Budget item not found" });
      return;
    }
    await itemRepo.delete(iid);
    res.status(204).send();
  } catch (err) {
    if (err instanceof Error && err.message === "Budget plan not found") {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error("Delete budget item:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete budget item" });
  }
});

budgetsRouter.get("/:bid/summary", async (req, res) => {
  try {
    const { hid, bid } = req.params as { hid: string; bid: string };
    const household = await ensureHousehold(hid);
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    const plan = await getBudgetPlanOrThrow(hid, bid);
    const summary = await getBudgetSummary(plan);
    res.json(summary);
  } catch (err) {
    if (err instanceof Error && err.message === "Budget plan not found") {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error("Budget summary:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get budget summary" });
  }
});

budgetsRouter.get("/:bid/comparison", async (req, res) => {
  try {
    const { hid, bid } = req.params as { hid: string; bid: string };
    const household = await ensureHousehold(hid);
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    const plan = await getBudgetPlanOrThrow(hid, bid);
    const comparison = await getBudgetComparison(plan);
    res.json(comparison);
  } catch (err) {
    if (err instanceof Error && err.message === "Budget plan not found") {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error("Budget comparison:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get budget comparison" });
  }
});
