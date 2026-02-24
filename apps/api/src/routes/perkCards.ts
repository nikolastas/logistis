import { Router } from "express";
import { dataSource } from "../db";
import { PerkCard } from "../entities/PerkCard";
import { User } from "../entities/User";
import { Household } from "../entities/Household";
import { getCategories } from "../categorizer";

export const perkCardsRouter = Router({ mergeParams: true });

perkCardsRouter.get("/", async (req, res) => {
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

    const list = await dataSource.getRepository(PerkCard).find({
      where: { userId: uid },
      relations: ["categories"],
      order: { createdAt: "ASC" },
    });
    res.json(list);
  } catch (err) {
    console.error("List perk cards:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list" });
  }
});

perkCardsRouter.post("/", async (req, res) => {
  try {
    const { hid, uid } = req.params as { hid: string; uid: string };
    const { name, monthlyValue, categoryIds } = req.body;

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

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (monthlyValue == null || typeof monthlyValue !== "number") {
      res.status(400).json({ error: "monthlyValue is required and must be a number" });
      return;
    }

    const validCategoryIds = new Set(getCategories().map((c) => c.id));
    const ids = Array.isArray(categoryIds)
      ? (categoryIds as unknown[]).filter((id): id is string => typeof id === "string" && validCategoryIds.has(id))
      : [];

    const repo = dataSource.getRepository(PerkCard);
    const perkCard = repo.create({
      userId: uid,
      name: name.trim(),
      monthlyValue: Number(monthlyValue),
    });
    const saved = await repo.save(perkCard);

    if (ids.length > 0) {
      await dataSource
        .createQueryBuilder()
        .relation(PerkCard, "categories")
        .of(saved)
        .add(ids);
    }

    const withCats = await repo.findOne({
      where: { id: saved.id },
      relations: ["categories"],
    });
    res.status(201).json(withCats ?? saved);
  } catch (err) {
    console.error("Create perk card:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Create failed" });
  }
});

perkCardsRouter.put("/:pid", async (req, res) => {
  try {
    const { hid, uid, pid } = req.params as { hid: string; uid: string; pid: string };
    const { name, monthlyValue, categoryIds } = req.body;

    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    const repo = dataSource.getRepository(PerkCard);
    const perkCard = await repo.findOne({ where: { id: pid, userId: uid }, relations: ["categories"] });
    if (!perkCard) {
      res.status(404).json({ error: "Perk card not found" });
      return;
    }

    if (name != null && typeof name === "string" && name.trim()) perkCard.name = name.trim();
    if (monthlyValue != null && typeof monthlyValue === "number") perkCard.monthlyValue = monthlyValue;

    if (categoryIds !== undefined) {
      const validCategoryIds = new Set(getCategories().map((c) => c.id));
      const ids = Array.isArray(categoryIds)
        ? (categoryIds as unknown[]).filter((id): id is string => typeof id === "string" && validCategoryIds.has(id))
        : [];
      await dataSource
        .createQueryBuilder()
        .relation(PerkCard, "categories")
        .of(perkCard).addAndRemove(ids, perkCard.categories.map((c) => c.id));
    }

    await repo.save(perkCard);
    const updated = await repo.findOne({ where: { id: pid }, relations: ["categories"] });
    res.json(updated ?? perkCard);
  } catch (err) {
    console.error("Update perk card:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

perkCardsRouter.delete("/:pid", async (req, res) => {
  try {
    const { hid, uid, pid } = req.params as { hid: string; uid: string; pid: string };

    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    const repo = dataSource.getRepository(PerkCard);
    const perkCard = await repo.findOne({ where: { id: pid, userId: uid } });
    if (!perkCard) {
      res.status(404).json({ error: "Perk card not found" });
      return;
    }

    await repo.delete(pid);
    res.status(204).send();
  } catch (err) {
    console.error("Delete perk card:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Delete failed" });
  }
});
