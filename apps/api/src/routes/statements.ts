import { Router } from 'express';
import multer from 'multer';
import { dataSource } from '../db';
import { Transaction } from '../entities/Transaction';
import { Household } from '../entities/Household';
import { User } from '../entities/User';
import { parseFile } from '../services/parserService';
import {
  linkOwnAccountTransfers,
  aliasNormalize,
  matchUserByAlias,
} from '../services/transferDetectionService';
import type { BankId } from '../parsers';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
export const statementsRouter = Router();

statementsRouter.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const bank = (req.body.bank || 'auto') as BankId;
    const userId =
      req.body.userId && typeof req.body.userId === 'string' ? req.body.userId : null;
    const householdId =
      req.body.householdId && typeof req.body.householdId === 'string'
        ? req.body.householdId
        : null;

    const mimeType = file.mimetype;

    let users: User[] = [];
    if (householdId) {
      users = await dataSource.getRepository(User).find({ where: { householdId } });
    }

    const { transactions, bankSource } = await parseFile(file.buffer, bank, mimeType, {
      householdId: householdId ?? undefined,
      users,
      userId: userId ?? undefined,
    });

    // Auto-create users for third_party transfer counterparties (each name found in transfers must be a user)
    // Counterparty users go in their own household (Option A), not the uploader's.
    const counterpartyToUserId = new Map<string, string>();
    let allUsers: User[] = [];
    if (householdId) {
      const userRepo = dataSource.getRepository(User);
      const householdRepo = dataSource.getRepository(Household);
      allUsers = await userRepo.find();
      const uniqueCounterparties = new Set<string>();
      for (const t of transactions) {
        const isThirdParty =
          t.categoryId === 'transfer/to-third-party' || t.categoryId === 'transfer/from-third-party';
        if (isThirdParty && t.transferCounterparty && t.transferCounterparty.trim().length >= 2) {
          uniqueCounterparties.add(t.transferCounterparty.trim());
        }
      }
      for (const cp of uniqueCounterparties) {
        const match = matchUserByAlias(cp, allUsers);
        if (match) {
          counterpartyToUserId.set(aliasNormalize(cp), match.userId);
        } else {
          const newHousehold = householdRepo.create({
            name: cp.length > 255 ? cp.slice(0, 252) + '...' : cp,
          });
          const savedHousehold = await householdRepo.save(newHousehold);
          const newUser = userRepo.create({
            householdId: savedHousehold.id,
            nickname: cp.length > 100 ? cp.slice(0, 97) + '...' : cp,
            nameAliases: [cp],
            color: '#6366f1',
          });
          const saved = await userRepo.save(newUser);
          allUsers.push(saved);
          counterpartyToUserId.set(aliasNormalize(cp), saved.id);
        }
      }
    }

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

      let transferCounterpartyUserId = t.transferCounterpartyUserId ?? null;
      let categoryId = t.categoryId;
      const isThirdParty =
        t.categoryId === 'transfer/to-third-party' || t.categoryId === 'transfer/from-third-party';
      if (isThirdParty && t.transferCounterparty && householdId) {
        const cpNorm = aliasNormalize(t.transferCounterparty);
        const linkedUserId = counterpartyToUserId.get(cpNorm);
        if (linkedUserId) {
          transferCounterpartyUserId = linkedUserId;
          const cpUser = allUsers.find((u: User) => u.id === linkedUserId);
          const sameHousehold = cpUser?.householdId === householdId;
          categoryId =
            t.amount < 0
              ? sameHousehold
                ? 'transfer/to-household-member'
                : 'transfer/to-external-member'
              : sameHousehold
                ? 'transfer/from-household-member'
                : 'transfer/from-external-member';
        }
      }

      const entity = repo.create({
        date: t.date,
        description: t.description,
        amount: t.amount,
        categoryId,
        userId,
        householdId: householdId ?? null,
        bankSource,
        bankReference: t.bankReference ?? null,
        rawData: t.rawData,
        transferCounterpartyUserId,
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
      userId,
      sample: created.slice(0, 5).map((c) => ({
        id: c.id,
        date: c.date,
        description: c.description,
        amount: c.amount,
        categoryId: c.categoryId,
      })),
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Upload failed' });
  }
});

/** Backfill: obsolete after Transaction refactor migration. Kept for API compatibility. */
statementsRouter.post('/backfill-counterparties', async (_req, res) => {
  res.json({ usersCreated: 0, transactionsUpdated: 0 });
});
