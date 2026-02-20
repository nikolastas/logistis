import { Router } from "express";
import multer from "multer";
import { dataSource } from "../db";
import { Transaction } from "../entities/Transaction";
import { Household } from "../entities/Household";
import { User } from "../entities/User";
import { parseFile } from "../services/parserService";
import { getDefaultSplitRatio } from "../services/incomeService";
import { linkOwnAccountTransfers } from "../services/transferDetectionService";
import type { BankId } from "../parsers";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
export const statementsRouter = Router();

statementsRouter.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const bank = (req.body.bank || "auto") as BankId;
    const ownerId = req.body.ownerId && typeof req.body.ownerId === "string" ? req.body.ownerId : null;
    const householdId = req.body.householdId && typeof req.body.householdId === "string" ? req.body.householdId : null;

    let splitRatio: Record<string, number> = {};
    if (householdId) {
      const household = await dataSource.getRepository(Household).findOne({ where: { id: householdId } });
      if (household) {
        splitRatio = await getDefaultSplitRatio(householdId);
      }
    }
    if (Object.keys(splitRatio).length === 0 && ownerId) {
      splitRatio = { [ownerId]: 1 };
    }
    if (Object.keys(splitRatio).length === 0) {
      splitRatio = {};
    }

    const mimeType = file.mimetype;

    let users: User[] = [];
    if (householdId) {
      users = await dataSource.getRepository(User).find({ where: { householdId } });
    }

    const { transactions, bankSource } = await parseFile(file.buffer, bank, mimeType, {
      householdId: householdId ?? undefined,
      users,
    });

    const repo = dataSource.getRepository(Transaction);
    const created: Transaction[] = [];
    let skipped = 0;

    for (const t of transactions) {
      if (t.bankReference) {
        const existing = await repo.findOne({
          where: { bankSource, bankReference: t.bankReference },
        });
        if (existing) {
          skipped++;
          continue;
        }
      }

      const entity = repo.create({
        date: t.date,
        description: t.description,
        amount: t.amount,
        categoryId: t.categoryId,
        ownerId,
        owner: ownerId ? null : ("shared" as const),
        splitRatio: Object.keys(splitRatio).length > 0 ? splitRatio : null,
        householdId: householdId ?? null,
        bankSource,
        bankReference: t.bankReference ?? null,
        rawData: t.rawData,
        transferType: t.transferType ?? null,
        transferCounterparty: t.transferCounterparty ?? null,
        transferCounterpartyUserId: t.transferCounterpartyUserId ?? null,
        isExcludedFromAnalytics: t.isExcludedFromAnalytics ?? false,
      });
      const saved = await repo.save(entity);
      created.push(saved);
    }

    if (householdId && created.length > 0) {
      await linkOwnAccountTransfers(householdId);
    }

    res.json({
      created: created.length,
      skipped,
      bankSource,
      ownerId,
      sample: created.slice(0, 5).map((c) => ({
        id: c.id,
        date: c.date,
        description: c.description,
        amount: c.amount,
        categoryId: c.categoryId,
      })),
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});
