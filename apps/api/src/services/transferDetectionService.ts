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

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
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

function matchHouseholdMember(
  extracted: string,
  users: User[]
): { userId: string; rawName: string } | null {
  if (!extracted || extracted.length < 2) return null;
  const extNorm = normalize(extracted);
  for (const u of users) {
    const el = normalize(u.legalNameEl);
    const en = normalize(u.legalNameEn);
    const partsEl = el.split(/\s+/).filter(Boolean);
    const partsEn = en.split(/\s+/).filter(Boolean);
    for (const part of [...partsEl, ...partsEn]) {
      if (part.length < 3) continue;
      if (levenshtein(extNorm, part) <= 2 || extNorm.includes(part) || part.includes(extNorm)) {
        return { userId: u.id, rawName: extracted };
      }
    }
    if (levenshtein(extNorm, el) <= 2 || levenshtein(extNorm, en) <= 2) {
      return { userId: u.id, rawName: extracted };
    }
  }
  return null;
}

export function classifyTransfer(
  description: string,
  amount: number,
  users: User[],
  rawData?: Record<string, unknown>
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
  for (const kw of ALPHA_THIRD_PARTY) {
    if (norm.includes(normalize(kw))) {
      const cp = extractCounterparty(description, kw);
      const match = matchHouseholdMember(cp, users);
      if (match) {
        return {
          transferType: "household_member",
          transferCounterparty: match.rawName,
          transferCounterpartyUserId: match.userId,
          isExcludedFromAnalytics: false,
          categoryId: amount < 0 ? "transfer/to-household-member" : "transfer/from-household-member",
          isHighConfidence: true,
        };
      }
      return {
        transferType: "third_party",
        transferCounterparty: cp || null,
        transferCounterpartyUserId: null,
        isExcludedFromAnalytics: false,
        categoryId: amount < 0 ? "transfer/to-third-party" : "transfer/from-third-party",
        isHighConfidence: true,
      };
    }
  }

  let matchedKeyword: string | null = null;
  let isOwnAccount = false;

  for (const kw of OWN_ACCOUNT_KEYWORDS) {
    if (norm.includes(normalize(kw))) {
      matchedKeyword = kw;
      isOwnAccount = true;
      break;
    }
  }
  if (!isOwnAccount) {
    for (const kw of THIRD_PARTY_KEYWORDS) {
      if (norm.includes(normalize(kw))) {
        matchedKeyword = kw;
        break;
      }
    }
  }

  if (!matchedKeyword) {
    if (isNbgTransferByCounterpartyAccount(rawData)) {
      const cpName = getNbgCounterpartyName(rawData);
      const match = cpName ? matchHouseholdMember(cpName, users) : null;
      if (match) {
        return {
          transferType: "household_member",
          transferCounterparty: match.rawName,
          transferCounterpartyUserId: match.userId,
          isExcludedFromAnalytics: false,
          categoryId: amount < 0 ? "transfer/to-household-member" : "transfer/from-household-member",
          isHighConfidence: true,
        };
      }
      return {
        transferType: "third_party",
        transferCounterparty: cpName,
        transferCounterpartyUserId: null,
        isExcludedFromAnalytics: false,
        categoryId: amount < 0 ? "transfer/to-third-party" : "transfer/from-third-party",
        isHighConfidence: true,
      };
    }
    return {
      transferType: "none",
      transferCounterparty: null,
      transferCounterpartyUserId: null,
      isExcludedFromAnalytics: false,
    };
  }

  const cp = extractCounterparty(description, matchedKeyword);

  if (isOwnAccount) {
    return {
      transferType: "own_account",
      transferCounterparty: null,
      transferCounterpartyUserId: null,
      isExcludedFromAnalytics: true,
      categoryId: "transfer/own-account",
    };
  }

  const match = matchHouseholdMember(cp, users);
  if (match) {
    return {
      transferType: "household_member",
      transferCounterparty: match.rawName,
      transferCounterpartyUserId: match.userId,
      isExcludedFromAnalytics: false,
      categoryId: amount < 0 ? "transfer/to-household-member" : "transfer/from-household-member",
    };
  }

  return {
    transferType: "third_party",
    transferCounterparty: cp || null,
    transferCounterpartyUserId: null,
    isExcludedFromAnalytics: false,
    categoryId: amount < 0 ? "transfer/to-third-party" : "transfer/from-third-party",
  };
}

/** Revolut rawData may have Type = 'TRANSFER' */
export function isRevolutOwnAccountTransfer(rawData?: Record<string, unknown>): boolean {
  const type = rawData?.Type ?? rawData?.type;
  return String(type).toUpperCase() === "TRANSFER";
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
      transferType: "own_account",
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
      .andWhere("tx.transferType = 'own_account'")
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
