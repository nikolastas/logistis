import { Router } from "express";
import { dataSource } from "../db";
import { Income } from "../entities/Income";
import { User } from "../entities/User";
import { Household } from "../entities/Household";
import { getActiveIncome, getHouseholdMonthlyIncome } from "../services/incomeService";
import { getCategories } from "../categorizer";

export const incomeRouter = Router({ mergeParams: true });

incomeRouter.get("/", async (req, res) => {
  try {
    const { hid, uid } = req.params as { hid: string; uid: string };

    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    const user = await dataSource.getRepository(User).findOne({ where: { id: uid, householdId: hid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const list = await dataSource.getRepository(Income).find({
      where: { userId: uid },
      order: { effectiveFrom: "DESC" },
    });
    res.json(list);
  } catch (err) {
    console.error("List income:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list" });
  }
});

incomeRouter.post("/", async (req, res) => {
  try {
    const { hid, uid } = req.params as { hid: string; uid: string };
    const { netMonthlySalary, grossMonthlySalary, effectiveFrom, notes, perkCards } = req.body;

    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    const user = await dataSource.getRepository(User).findOne({ where: { id: uid, householdId: hid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (netMonthlySalary == null || typeof netMonthlySalary !== "number") {
      res.status(400).json({ error: "netMonthlySalary is required and must be a number" });
      return;
    }
    if (!effectiveFrom || typeof effectiveFrom !== "string" || !effectiveFrom.trim()) {
      res.status(400).json({ error: "effectiveFrom is required (ISO date)" });
      return;
    }

    const repo = dataSource.getRepository(Income);
    const prevActive = await getActiveIncome(uid);
    if (prevActive) {
      const fromDate = new Date(effectiveFrom);
      fromDate.setDate(fromDate.getDate() - 1);
      prevActive.effectiveTo = fromDate.toISOString().slice(0, 10);
      await repo.save(prevActive);
    }

    const validCategoryIds = new Set(getCategories().map((c) => c.id));
    const validPerkCards =
      Array.isArray(perkCards) &&
      perkCards.every(
        (p: unknown) =>
          p != null &&
          typeof p === "object" &&
          "name" in p &&
          "monthlyValue" in p &&
          "categoryId" in p &&
          typeof (p as { name: unknown }).name === "string" &&
          typeof (p as { monthlyValue: unknown }).monthlyValue === "number" &&
          typeof (p as { categoryId: unknown }).categoryId === "string" &&
          validCategoryIds.has((p as { categoryId: string }).categoryId)
      )
        ? perkCards.map((p: { name: string; monthlyValue: number; categoryId: string }) => ({
            name: String(p.name).trim(),
            monthlyValue: Number(p.monthlyValue),
            categoryId: String(p.categoryId).trim(),
          }))
        : null;

    const income = repo.create({
      userId: uid,
      householdId: hid,
      netMonthlySalary,
      grossMonthlySalary: grossMonthlySalary != null ? grossMonthlySalary : null,
      effectiveFrom: effectiveFrom.trim(),
      effectiveTo: null,
      notes: notes != null && typeof notes === "string" ? notes.trim() : null,
      perkCards: validPerkCards && validPerkCards.length > 0 ? validPerkCards : null,
    });
    const saved = await repo.save(income);
    res.status(201).json(saved);
  } catch (err) {
    console.error("Create income:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Create failed" });
  }
});

incomeRouter.put("/:iid", async (req, res) => {
  try {
    const { hid, uid, iid } = req.params as { hid: string; uid: string; iid: string };
    const { netMonthlySalary, grossMonthlySalary, effectiveFrom, effectiveTo, notes, perkCards } =
      req.body;

    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    const user = await dataSource.getRepository(User).findOne({ where: { id: uid, householdId: hid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const repo = dataSource.getRepository(Income);
    const income = await repo.findOne({ where: { id: iid, userId: uid } });
    if (!income) {
      res.status(404).json({ error: "Income record not found" });
      return;
    }

    if (netMonthlySalary != null && typeof netMonthlySalary === "number") income.netMonthlySalary = netMonthlySalary;
    if (grossMonthlySalary !== undefined) income.grossMonthlySalary = grossMonthlySalary;
    if (effectiveFrom != null && typeof effectiveFrom === "string") income.effectiveFrom = effectiveFrom.trim();
    if (effectiveTo !== undefined) income.effectiveTo = effectiveTo;
    if (notes !== undefined) income.notes = notes != null && typeof notes === "string" ? notes.trim() : null;
    if (perkCards !== undefined) {
      const validCategoryIds = new Set(getCategories().map((c) => c.id));
      const valid =
        Array.isArray(perkCards) &&
        perkCards.every(
          (p: unknown) =>
            p != null &&
            typeof p === "object" &&
            "name" in p &&
            "monthlyValue" in p &&
            "categoryId" in p &&
            typeof (p as { name: unknown }).name === "string" &&
            typeof (p as { monthlyValue: unknown }).monthlyValue === "number" &&
            typeof (p as { categoryId: unknown }).categoryId === "string" &&
            validCategoryIds.has((p as { categoryId: string }).categoryId)
        );
      income.perkCards =
        valid && perkCards.length > 0
          ? perkCards.map((p: { name: string; monthlyValue: number; categoryId: string }) => ({
              name: String(p.name).trim(),
              monthlyValue: Number(p.monthlyValue),
              categoryId: String(p.categoryId).trim(),
            }))
          : null;
    }

    await repo.save(income);
    res.json(income);
  } catch (err) {
    console.error("Update income:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

incomeRouter.delete("/:iid", async (req, res) => {
  try {
    const { hid, uid, iid } = req.params as { hid: string; uid: string; iid: string };

    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    const user = await dataSource.getRepository(User).findOne({ where: { id: uid, householdId: hid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const repo = dataSource.getRepository(Income);
    const income = await repo.findOne({ where: { id: iid, userId: uid } });
    if (!income) {
      res.status(404).json({ error: "Income record not found" });
      return;
    }

    await repo.delete(iid);
    res.status(204).send();
  } catch (err) {
    console.error("Delete income:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Delete failed" });
  }
});
