import { Router } from "express";
import { dataSource } from "../db";
import { Household } from "../entities/Household";
import { User } from "../entities/User";
import { Income } from "../entities/Income";
import { Transaction } from "../entities/Transaction";
import { getHouseholdMonthlyIncome, getSharedExpenseSplit } from "../services/incomeService";
import { getTransfersInsight } from "../services/insightsService";

export const householdsRouter = Router();

householdsRouter.get("/", async (_req, res) => {
  try {
    const repo = dataSource.getRepository(Household);
    const list = await repo.find({ order: { createdAt: "ASC" } });
    const withCount = await Promise.all(
      list.map(async (h) => {
        const userCount = await dataSource.getRepository(User).count({ where: { householdId: h.id } });
        return {
          id: h.id,
          name: h.name,
          createdAt: h.createdAt,
          userCount,
        };
      })
    );
    res.json(withCount);
  } catch (err) {
    console.error("List households:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list" });
  }
});

householdsRouter.post("/", async (req, res) => {
  try {
    const { name, defaultSavingsTarget } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (
      defaultSavingsTarget !== undefined &&
      defaultSavingsTarget !== null &&
      (typeof defaultSavingsTarget !== "number" || Number.isNaN(defaultSavingsTarget) || defaultSavingsTarget < 0)
    ) {
      res.status(400).json({ error: "defaultSavingsTarget must be a non-negative number" });
      return;
    }
    const repo = dataSource.getRepository(Household);
    const household = repo.create({
      name: name.trim(),
      defaultSavingsTarget: defaultSavingsTarget ?? null,
    });
    const saved = await repo.save(household);
    res.status(201).json(saved);
  } catch (err) {
    console.error("Create household:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Create failed" });
  }
});

householdsRouter.get("/:hid/shared-expense-split", async (req, res) => {
  try {
    const { hid } = req.params;
    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    const split = await getSharedExpenseSplit(hid);
    res.json(split);
  } catch (err) {
    console.error("Shared expense split:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

householdsRouter.get("/:hid/insights/transfers", async (req, res) => {
  try {
    const { hid } = req.params;
    const { month } = req.query as { month?: string };

    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    const result = await getTransfersInsight(hid, month);
    res.json(result);
  } catch (err) {
    console.error("Transfers insight:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

householdsRouter.get("/:hid/income-summary", async (req, res) => {
  try {
    const { hid } = req.params;
    const { month } = req.query as { month?: string };

    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    const date = month ? new Date(month) : new Date();
    const result = await getHouseholdMonthlyIncome(hid, date);
    res.json(result);
  } catch (err) {
    console.error("Household income summary:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

householdsRouter.get("/:hid", async (req, res) => {
  try {
    const { hid } = req.params;
    const repo = dataSource.getRepository(Household);
    const household = await repo.findOne({
      where: { id: hid },
      relations: ["users"],
    });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    res.json(household);
  } catch (err) {
    console.error("Get household:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get" });
  }
});

householdsRouter.put("/:hid", async (req, res) => {
  try {
    const { hid } = req.params;
    const { name, defaultSavingsTarget } = req.body;
    const repo = dataSource.getRepository(Household);
    const household = await repo.findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    if (name != null && typeof name === "string" && name.trim()) {
      household.name = name.trim();
    }
    if (defaultSavingsTarget !== undefined) {
      if (defaultSavingsTarget === null) {
        household.defaultSavingsTarget = null;
      } else if (
        typeof defaultSavingsTarget === "number" &&
        !Number.isNaN(defaultSavingsTarget) &&
        defaultSavingsTarget >= 0
      ) {
        household.defaultSavingsTarget = defaultSavingsTarget;
      } else {
        res.status(400).json({ error: "defaultSavingsTarget must be null or a non-negative number" });
        return;
      }
    }
    await repo.save(household);
    res.json(household);
  } catch (err) {
    console.error("Update household:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

householdsRouter.delete("/:hid", async (req, res) => {
  try {
    const { hid } = req.params;
    const householdRepo = dataSource.getRepository(Household);
    const household = await householdRepo.findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    const userRepo = dataSource.getRepository(User);
    const users = await userRepo.find({ where: { householdId: hid } });
    const userIds = users.map((u) => u.id);

    const txRepo = dataSource.getRepository(Transaction);
    await txRepo
      .createQueryBuilder()
      .update(Transaction)
      .set({ householdId: null, orphaned: true })
      .where("householdId = :hid", { hid })
      .execute();

    const incomeRepo = dataSource.getRepository(Income);
    for (const uid of userIds) {
      await incomeRepo.delete({ userId: uid });
    }
    await userRepo.delete({ householdId: hid });
    await householdRepo.delete(hid);

    res.status(204).send();
  } catch (err) {
    console.error("Delete household:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Delete failed" });
  }
});
