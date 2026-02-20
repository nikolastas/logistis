import { Router } from "express";
import { dataSource } from "../db";
import { SavingsGoal } from "../entities/SavingsGoal";
import {
  computeMonthlySavingsTarget,
} from "../services/insightsService";

export const goalsRouter = Router();

goalsRouter.get("/", async (_req, res) => {
  try {
    const list = await dataSource
      .getRepository(SavingsGoal)
      .find({ order: { targetDate: "ASC" } });
    res.json(list);
  } catch (err) {
    console.error("List goals:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list" });
  }
});

goalsRouter.post("/", async (req, res) => {
  try {
    const { name, targetAmount, currentAmount, targetDate } = req.body;
    const repo = dataSource.getRepository(SavingsGoal);
    const goal = repo.create({
      name: name || "New Goal",
      targetAmount: targetAmount ?? 0,
      currentAmount: currentAmount ?? 0,
      targetDate: targetDate || new Date().toISOString().slice(0, 10),
    });
    const saved = await repo.save(goal);
    res.status(201).json(saved);
  } catch (err) {
    console.error("Create goal:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Create failed" });
  }
});

goalsRouter.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, targetAmount, currentAmount, targetDate } = req.body;

    const repo = dataSource.getRepository(SavingsGoal);
    const goal = await repo.findOne({ where: { id } });
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    if (name != null) goal.name = name;
    if (targetAmount != null) goal.targetAmount = targetAmount;
    if (currentAmount != null) goal.currentAmount = currentAmount;
    if (targetDate != null) goal.targetDate = targetDate;

    await repo.save(goal);
    res.json(goal);
  } catch (err) {
    console.error("Update goal:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

goalsRouter.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const repo = dataSource.getRepository(SavingsGoal);
    const result = await repo.delete(id);
    if (result.affected === 0) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error("Delete goal:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Delete failed" });
  }
});

goalsRouter.get("/:id/savings-suggestion", async (req, res) => {
  try {
    const { id } = req.params;
    const repo = dataSource.getRepository(SavingsGoal);
    const goal = await repo.findOne({ where: { id } });
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    const target = Number(goal.targetAmount);
    const current = Number(goal.currentAmount);
    const suggestion = computeMonthlySavingsTarget(
      target,
      current,
      goal.targetDate
    );
    res.json({ ...suggestion, goalId: id });
  } catch (err) {
    console.error("Savings suggestion:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});
