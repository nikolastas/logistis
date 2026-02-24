import { IsNull } from "typeorm";
import type { User } from "../entities/User";
import { Transaction } from "../entities/Transaction";
import { dataSource } from "../db";

const OWN_ACCOUNT_KEYWORDS = [
  "ΜΕΤΑΦΟΡΑ ΠΡΟΣ",
  "METAFORA",
  "ΕΜΒΑΣΜΑ ΠΡΟΣ",
  "EMVASMA",
  "REVOLUT",
  "WISE",
  "ΔΙΑΤΡΑΠΕΖΙΚΗ",
  "DIATRAPEZIKI",
  "SEPA TRANSFER",
  "CREDIT TRANSFER",
  "OWN ACCOUNT",
  "INTERNAL TRANSFER",
];

const THIRD_PARTY_KEYWORDS = [
  "ΑΠΟΣΤΟΛΗ ΣΕ",
  "ΠΛΗΡΩΜΗ ΠΡΟΣ",
  "SEND MONEY",
  "PAYMENT TO",
  "TRANSFERRED TO",
  "ΜΕΤΑΦΟΡΑ ΑΠΟ",
  "ΕΙΣΠΡΑΞΗ ΑΠΟ",
];

/** Alpha Bank high-confidence: skip review queue */
const ALPHA_OWN_ACCOUNT = ["ΕΜΒΑΣΜΑ ΙΔΙΟΚΤΗΤΗ"];
const ALPHA_THIRD_PARTY = ["ΕΜΒΑΣΜΑ ΤΡΙΤΟΥ"];

/** Payzy top-up from bank/card (e.g. NGB, Revolut) – own-account transfer */
const PAYZY_OWN_ACCOUNT = ["PAYZY BY COSMOTE"];

export type TransferClassification = {
  transferType: "none" | "own_account" | "household_member" | "third_party";
  transferCounterparty: string | null;
  transferCounterpartyUserId: string | null;
  isExcludedFromAnalytics: boolean;
  categoryId?: string;
  isHighConfidence?: boolean;
};

function normalize(str: string): string {
  return str
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
}

function extractCounterparty(description: string, keyword: string): string {
  const norm = normalize(description);
  const kwNorm = normalize(keyword);
  const idx = norm.indexOf(kwNorm);
  if (idx < 0) return "";
  const after = norm.slice(idx + kwNorm.length).trim();
  const end = Math.min(
    after.indexOf(" ") >= 0 ? after.indexOf(" ") + 20 : after.length,
    after.search(/\d|€|EUR|\.\d{2}/) >= 0 ? after.search(/\d|€|EUR|\.\d{2}/) : after.length
  );
  return after.slice(0, end > 0 ? end : 50).trim();
}

/** Normalize for exact alias match: uppercase, trim, collapse spaces. Exported for use in upload flow. */
export function aliasNormalize(str: string): string {
  return str
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** Match counterparty string against user nameAliases. Exact match only (case-insensitive). */
export function matchUserByAlias(
  extracted: string,
  users: User[]
): { userId: string; rawName: string } | null {
  if (!extracted || extracted.trim().length < 2) return null;
  const extNorm = aliasNormalize(extracted);
  const aliases = (u: User) => (u.nameAliases ?? []) as string[];
  for (const u of users) {
    for (const alias of aliases(u)) {
      if (!alias || String(alias).trim().length < 2) continue;
      const aNorm = aliasNormalize(String(alias));
      if (extNorm === aNorm) return { userId: u.id, rawName: extracted };
    }
  }
  return null;
}

/**
 * Classify transfer by counterparty name matching against user nameAliases.
 * - Same user (counterparty === owner) → own_account
 * - Different household user → household_member
 * - No match → third_party
 */
function resolveTransferByCounterparty(
  counterparty: string | null,
  userId: string | null,
  users: User[],
  amount: number
): TransferClassification {
  if (!counterparty || counterparty.trim().length < 2) {
    return {
      transferType: "third_party",
      transferCounterparty: counterparty,
      transferCounterpartyUserId: null,
      isExcludedFromAnalytics: false,
      categoryId: amount < 0 ? "transfer/to-third-party" : "transfer/from-third-party",
    };
  }
  const match = matchUserByAlias(counterparty, users);
  if (!match) {
    return {
      transferType: "third_party",
      transferCounterparty: counterparty,
      transferCounterpartyUserId: null,
      isExcludedFromAnalytics: false,
      categoryId: amount < 0 ? "transfer/to-third-party" : "transfer/from-third-party",
    };
  }
  if (userId && match.userId === userId) {
    return {
      transferType: "own_account",
      transferCounterparty: match.rawName,
      transferCounterpartyUserId: match.userId,
      isExcludedFromAnalytics: true,
      categoryId: "transfer/own-account",
    };
  }
  return {
    transferType: "household_member",
    transferCounterparty: match.rawName,
    transferCounterpartyUserId: match.userId,
    isExcludedFromAnalytics: false,
    categoryId: amount < 0 ? "transfer/to-household-member" : "transfer/from-household-member",
  };
}

export function classifyTransfer(
  description: string,
  amount: number,
  users: User[],
  rawData?: Record<string, unknown>,
  userId?: string | null
): TransferClassification {
  const norm = normalize(description);

  for (const kw of ALPHA_OWN_ACCOUNT) {
    if (norm.includes(normalize(kw))) {
      return {
        transferType: "own_account",
        transferCounterparty: null,
        transferCounterpartyUserId: null,
        isExcludedFromAnalytics: true,
        categoryId: "transfer/own-account",
        isHighConfidence: true,
      };
    }
  }
  for (const kw of PAYZY_OWN_ACCOUNT) {
    if (norm.includes(normalize(kw))) {
      return {
        transferType: "own_account",
        transferCounterparty: null,
        transferCounterpartyUserId: null,
        isExcludedFromAnalytics: true,
        categoryId: "transfer/own-account",
        isHighConfidence: true,
      };
    }
  }
  for (const kw of ALPHA_THIRD_PARTY) {
    if (norm.includes(normalize(kw))) {
      const cpRaw = extractCounterparty(description, kw) || getNbgCounterpartyName(rawData);
      const cp = cpRaw != null ? cpRaw : null;
      return resolveTransferByCounterparty(cp, userId ?? null, users, amount);
    }
  }

  let matchedKeyword: string | null = null;
  let isOwnAccountKeyword = false;

  for (const kw of OWN_ACCOUNT_KEYWORDS) {
    if (norm.includes(normalize(kw))) {
      matchedKeyword = kw;
      isOwnAccountKeyword = true;
      break;
    }
  }
  if (!isOwnAccountKeyword) {
    for (const kw of THIRD_PARTY_KEYWORDS) {
      if (norm.includes(normalize(kw))) {
        matchedKeyword = kw;
        break;
      }
    }
  }

  if (!matchedKeyword) {
    if (isNbgTransferByCounterpartyAccount(rawData)) {
      const cpName = getNbgCounterpartyName(rawData) ?? null;
      return resolveTransferByCounterparty(cpName, userId ?? null, users, amount);
    }
    if (isRevolutTransferByCounterparty(rawData)) {
      const cp = getRevolutCounterpartyName(rawData);
      return resolveTransferByCounterparty(cp ?? null, userId ?? null, users, amount);
    }
    return {
      transferType: "none",
      transferCounterparty: null,
      transferCounterpartyUserId: null,
      isExcludedFromAnalytics: false,
    };
  }

  const cp = extractCounterparty(description, matchedKeyword) || getNbgCounterpartyName(rawData);

  if (isOwnAccountKeyword) {
    if (cp && users.length > 0) {
      const match = matchUserByAlias(cp, users);
      if (match && userId && match.userId === userId) {
        return {
          transferType: "own_account",
          transferCounterparty: match.rawName,
          transferCounterpartyUserId: match.userId,
          isExcludedFromAnalytics: true,
          categoryId: "transfer/own-account",
        };
      }
      if (match) {
        return {
          transferType: "household_member",
          transferCounterparty: match.rawName,
          transferCounterpartyUserId: match.userId,
          isExcludedFromAnalytics: false,
          categoryId: amount < 0 ? "transfer/to-household-member" : "transfer/from-household-member",
        };
      }
    }
    return {
      transferType: "own_account",
      transferCounterparty: cp || null,
      transferCounterpartyUserId: null,
      isExcludedFromAnalytics: true,
      categoryId: "transfer/own-account",
    };
  }

  return resolveTransferByCounterparty(cp ?? null, userId ?? null, users, amount);
}

/** Revolut: only pocket transfers (To pocket / Αποταμίευση) are own_account */
export function isRevolutOwnAccountTransfer(rawData?: Record<string, unknown>): boolean {
  return rawData?.isOwnAccountTransfer === true;
}

/** Payzy: PAYZY BY COSMOTE (top-up from bank) is own_account */
export function isPayzyOwnAccountTransfer(rawData?: Record<string, unknown>): boolean {
  return rawData?.isOwnAccountTransfer === true;
}

/** Revolut: person-to-person transfer with counterparty in rawData */
export function isRevolutTransferByCounterparty(rawData?: Record<string, unknown>): boolean {
  const type = rawData?.Type ?? rawData?.type;
  const cp = rawData?.transferCounterparty;
  return String(type).toUpperCase() === "TRANSFER" && !!cp && String(cp).trim().length > 0;
}

/** Get counterparty name from Revolut rawData for household member matching */
export function getRevolutCounterpartyName(rawData?: Record<string, unknown>): string | null {
  const cp = rawData?.transferCounterparty;
  if (!cp || String(cp).trim().length === 0) return null;
  return String(cp).trim();
}

/** NBG XLSX: Λογαριασμός αντισυμβαλλόμενου (counterparty account) present → transfer */
export function isNbgTransferByCounterpartyAccount(rawData?: Record<string, unknown>): boolean {
  const cp = rawData?.counterpartyAccount ?? (rawData?.row as Record<string, unknown>)?.["Λογαριασμός αντισυμβαλλόμενου"];
  return !!cp && String(cp).trim().length > 0;
}

/** Get counterparty name from NBG rawData for household member matching */
export function getNbgCounterpartyName(rawData?: Record<string, unknown>): string | null {
  const name = rawData?.counterpartyName ?? (rawData?.row as Record<string, unknown>)?.["Ονοματεπώνυμο αντισυμβαλλόμενου"];
  if (!name || String(name).trim().length === 0) return null;
  return String(name).trim();
}

export async function linkOwnAccountTransfers(householdId: string): Promise<number> {
  const repo = dataSource.getRepository(Transaction);
  const candidates = await repo.find({
    where: {
      householdId,
      categoryId: "transfer/own-account",
      linkedTransactionId: IsNull(),
    },
    order: { date: "ASC" },
  });

  let linked = 0;
  const processed = new Set<string>();

  for (const t of candidates) {
    if (processed.has(t.id)) continue;

    const amount = parseFloat(String(t.amount));
    const date = t.date;
    const dateFrom = new Date(date);
    dateFrom.setDate(dateFrom.getDate() - 2);
    const dateTo = new Date(date);
    dateTo.setDate(dateTo.getDate() + 2);
    const fromStr = dateFrom.toISOString().slice(0, 10);
    const toStr = dateTo.toISOString().slice(0, 10);

    const unlinked = await repo
      .createQueryBuilder("tx")
      .where("tx.householdId = :hid", { hid: householdId })
      .andWhere("tx.categoryId = :cat", { cat: "transfer/own-account" })
      .andWhere("tx.id != :id", { id: t.id })
      .andWhere("tx.linkedTransactionId IS NULL")
      .andWhere("tx.date >= :from", { from: fromStr })
      .andWhere("tx.date <= :to", { to: toStr })
      .getMany();

    let opposite: InstanceType<typeof Transaction> | null = null;
    for (const o of unlinked) {
      const oAmount = parseFloat(String(o.amount));
      if (Math.abs(oAmount + amount) <= 0.01) {
        opposite = o;
        break;
      }
    }

    if (!opposite) {
      await repo.update(t.id, {
        isExcludedFromAnalytics: true,
        categoryId: "transfer/own-account",
      });
      continue;
    }

    await repo.update(t.id, {
      linkedTransactionId: opposite.id,
      isExcludedFromAnalytics: true,
      categoryId: "transfer/own-account",
    });
    await repo.update(opposite.id, {
      linkedTransactionId: t.id,
      isExcludedFromAnalytics: true,
      categoryId: "transfer/own-account",
    });
    processed.add(t.id);
    processed.add(opposite.id);
    linked += 2;
  }

  return linked;
}
