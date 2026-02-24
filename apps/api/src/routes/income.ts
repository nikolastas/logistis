import { Router } from "express";
import { dataSource } from "../db";
import { Income } from "../entities/Income";
import { IncomePerkCard } from "../entities/IncomePerkCard";
import { PerkCard } from "../entities/PerkCard";
import { User } from "../entities/User";
import { Household } from "../entities/Household";
import { getActiveIncome, getHouseholdMonthlyIncome } from "../services/incomeService";
import { getCategories } from "../categorizer";

export const incomeRouter = Router({ mergeParams: true });

async function linkPerkCardsToIncome(
  userId: string,
  incomeId: string,
  perkCards: unknown
): Promise<void> {
  if (!Array.isArray(perkCards) || perkCards.length === 0) return;

  const validCategoryIds = new Set(getCategories().map((c) => c.id));
  const perkRepo = dataSource.getRepository(PerkCard);
  const ipcRepo = dataSource.getRepository(IncomePerkCard);

  for (const p of perkCards) {
    if (!p || typeof p !== "object") continue;
    const monthlyValue = Number((p as { monthlyValue?: unknown }).monthlyValue) || 0;

    let perkCardId: string | null = null;

    const pid = (p as { perkCardId?: unknown }).perkCardId ?? (p as { id?: unknown }).id;
    if (typeof pid === "string") {
      const existing = await perkRepo.findOne({
        where: { id: pid, userId },
      });
      if (existing) perkCardId = existing.id;
    }

    if (!perkCardId) {
      const name = String((p as { name?: unknown }).name ?? "").trim();
      if (!name) continue;

      const categoryIds = (p as { categoryIds?: unknown }).categoryIds;
      const categoryId = (p as { categoryId?: unknown }).categoryId;
      const ids = Array.isArray(categoryIds)
        ? (categoryIds as unknown[]).filter((id): id is string => typeof id === "string" && validCategoryIds.has(id))
        : typeof categoryId === "string" && validCategoryIds.has(categoryId)
          ? [categoryId]
          : [];

      let perk = await perkRepo.findOne({ where: { userId, name }, relations: ["categories"] });
      if (!perk) {
        perk = perkRepo.create({ userId, name, monthlyValue });
        await perkRepo.save(perk);
        if (ids.length > 0) {
          await dataSource.createQueryBuilder().relation(PerkCard, "categories").of(perk).add(ids);
        }
      }
      perkCardId = perk.id;
    }

    if (perkCardId) {
      const existing = await ipcRepo.findOne({ where: { incomeId, perkCardId } });
      if (existing) {
        existing.monthlyValue = monthlyValue;
        await ipcRepo.save(existing);
      } else {
        const ipc = ipcRepo.create({
          incomeId,
          perkCardId,
          monthlyValue,
        });
        await ipcRepo.save(ipc);
      }
    }
  }
}

function toIncomeResponse(income: Income): Record<string, unknown> {
  const base = {
    id: income.id,
    userId: income.userId,
    householdId: income.householdId,
    netMonthlySalary: income.netMonthlySalary,
    effectiveFrom: income.effectiveFrom,
    effectiveTo: income.effectiveTo,
    notes: income.notes,
    createdAt: income.createdAt,
    updatedAt: income.updatedAt,
  };
  const perkCards = (income.incomePerkCards ?? []).map((ipc) => {
    const pc = ipc.perkCard;
    const val = ipc.monthlyValue != null ? Number(ipc.monthlyValue) : (pc ? Number(pc.monthlyValue) : 0);
    return {
      id: pc?.id,
      name: pc?.name ?? "",
      monthlyValue: val,
      categoryIds: (pc?.categories ?? []).map((c) => c.id),
    };
  });
  return { ...base, perkCards };
}

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
      relations: ["incomePerkCards", "incomePerkCards.perkCard", "incomePerkCards.perkCard.categories"],
      order: { effectiveFrom: "DESC" },
    });
    res.json(list.map(toIncomeResponse));
  } catch (err) {
    console.error("List income:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list" });
  }
});

incomeRouter.post("/", async (req, res) => {
  try {
    const { hid, uid } = req.params as { hid: string; uid: string };
    const { netMonthlySalary, effectiveFrom, notes, perkCards } = req.body;

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

    const income = repo.create({
      userId: uid,
      householdId: hid,
      netMonthlySalary,
      effectiveFrom: effectiveFrom.trim(),
      effectiveTo: null,
      notes: notes != null && typeof notes === "string" ? notes.trim() : null,
    });
    const saved = await repo.save(income);

    await linkPerkCardsToIncome(uid, saved.id, perkCards);

    const withRels = await repo.findOne({
      where: { id: saved.id },
      relations: ["incomePerkCards", "incomePerkCards.perkCard", "incomePerkCards.perkCard.categories"],
    });
    res.status(201).json(withRels ? toIncomeResponse(withRels) : saved);
  } catch (err) {
    console.error("Create income:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Create failed" });
  }
});

incomeRouter.put("/:iid", async (req, res) => {
  try {
    const { hid, uid, iid } = req.params as { hid: string; uid: string; iid: string };
    const { netMonthlySalary, effectiveFrom, effectiveTo, notes, perkCards } =
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
    if (effectiveFrom != null && typeof effectiveFrom === "string") income.effectiveFrom = effectiveFrom.trim();
    if (effectiveTo !== undefined) income.effectiveTo = effectiveTo;
    if (notes !== undefined) income.notes = notes != null && typeof notes === "string" ? notes.trim() : null;

    await repo.save(income);

    if (perkCards !== undefined) {
      await dataSource.getRepository(IncomePerkCard).delete({ incomeId: iid });
      await linkPerkCardsToIncome(uid, iid, perkCards);
    }

    const withRels = await repo.findOne({
      where: { id: iid },
      relations: ["incomePerkCards", "incomePerkCards.perkCard", "incomePerkCards.perkCard.categories"],
    });
    res.json(withRels ? toIncomeResponse(withRels) : income);
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
