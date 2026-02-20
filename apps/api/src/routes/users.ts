import { Router } from "express";
import { dataSource } from "../db";
import { User } from "../entities/User";
import { Household } from "../entities/Household";
import { Transaction } from "../entities/Transaction";
import { Income } from "../entities/Income";

export const usersRouter = Router({ mergeParams: true });

usersRouter.get("/", async (req, res) => {
  try {
    const { hid } = req.params as { hid: string };
    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    const list = await dataSource.getRepository(User).find({
      where: { householdId: hid },
      order: { createdAt: "ASC" },
    });
    res.json(list);
  } catch (err) {
    console.error("List users:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list" });
  }
});

usersRouter.post("/", async (req, res) => {
  try {
    const { hid } = req.params as { hid: string };
    const { nickname, legalNameEl, legalNameEn, color } = req.body;

    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    if (!nickname || typeof nickname !== "string" || !nickname.trim()) {
      res.status(400).json({ error: "nickname is required" });
      return;
    }
    if (!legalNameEl || typeof legalNameEl !== "string" || !legalNameEl.trim()) {
      res.status(400).json({ error: "legalNameEl is required" });
      return;
    }
    if (!legalNameEn || typeof legalNameEn !== "string" || !legalNameEn.trim()) {
      res.status(400).json({ error: "legalNameEn is required" });
      return;
    }

    const repo = dataSource.getRepository(User);
    const user = repo.create({
      householdId: hid,
      nickname: nickname.trim(),
      legalNameEl: legalNameEl.trim(),
      legalNameEn: legalNameEn.trim(),
      color: color && typeof color === "string" ? color.trim() : "#6366f1",
    });
    const saved = await repo.save(user);
    res.status(201).json(saved);
  } catch (err) {
    console.error("Create user:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Create failed" });
  }
});

usersRouter.get("/:uid/orphaned-count", async (req, res) => {
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
    const count = await dataSource.getRepository(Transaction).count({
      where: { ownerId: uid },
    });
    res.json({ orphanedTransactionCount: count });
  } catch (err) {
    console.error("Orphaned count:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

usersRouter.put("/:uid", async (req, res) => {
  try {
    const { hid, uid } = req.params as { hid: string; uid: string };
    const { nickname, legalNameEl, legalNameEn, color } = req.body;

    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    const repo = dataSource.getRepository(User);
    const user = await repo.findOne({ where: { id: uid, householdId: hid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (nickname != null && typeof nickname === "string") user.nickname = nickname.trim();
    if (legalNameEl != null && typeof legalNameEl === "string") user.legalNameEl = legalNameEl.trim();
    if (legalNameEn != null && typeof legalNameEn === "string") user.legalNameEn = legalNameEn.trim();
    if (color != null && typeof color === "string") user.color = color.trim();

    await repo.save(user);
    res.json(user);
  } catch (err) {
    console.error("Update user:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

usersRouter.delete("/:uid", async (req, res) => {
  try {
    const { hid, uid } = req.params as { hid: string; uid: string };

    const household = await dataSource.getRepository(Household).findOne({ where: { id: hid } });
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: uid, householdId: hid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const txRepo = dataSource.getRepository(Transaction);
    const result = await txRepo
      .createQueryBuilder()
      .update(Transaction)
      .set({ ownerId: null, orphaned: true })
      .where("ownerId = :uid", { uid })
      .execute();

    const orphanedTransactionCount = result.affected ?? 0;

    await dataSource.getRepository(Income).delete({ userId: uid });
    await userRepo.delete(uid);

    if (household.defaultSplit && uid in household.defaultSplit) {
      const { [uid]: _, ...rest } = household.defaultSplit;
      const sum = Object.values(rest).reduce((a, b) => a + b, 0);
      const normalized =
        sum > 0
          ? Object.fromEntries(
              Object.entries(rest).map(([k, v]) => [k, v / sum])
            )
          : null;
      await dataSource.getRepository(Household).update(hid, {
        defaultSplit: normalized,
      });
    }

    res.json({ orphanedTransactionCount });
  } catch (err) {
    console.error("Delete user:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Delete failed" });
  }
});
