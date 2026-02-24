import { dataSource } from "../db";
import { Transaction } from "../entities/Transaction";
import { isExcludedFromSpending } from "../categorizer";
import { getSharedExpenseSplit } from "./incomeService";

export interface SpendingByCategory {
  categoryId: string;
  categoryName?: string;
  total: number;
  count: number;
}

export interface SpendingByOwner {
  owner: string;
  userId?: string | null;
  total: number;
  count: number;
}

export interface SpendingByMonth {
  month: string;
  total: number;
  count: number;
}

export interface SavingsSuggestion {
  goalId: string;
  monthlyTarget: number;
  monthsRemaining: number;
  remainingAmount: number;
}

export async function getSpendingByCategory(
  from?: string,
  to?: string,
  householdId?: string,
  userId?: string | null
): Promise<SpendingByCategory[]> {
  const qb = dataSource
    .getRepository(Transaction)
    .createQueryBuilder("t")
    .select("t.categoryId", "categoryId")
    .addSelect("SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END)", "total")
    .addSelect("SUM(CASE WHEN t.amount < 0 THEN 1 ELSE 0 END)", "count")
    .where("t.amount != 0")
    .andWhere("(t.isExcludedFromAnalytics = false OR t.isExcludedFromAnalytics IS NULL)")
    .andWhere(
      "(t.categoryId NOT LIKE 'transfer/%' OR (t.categoryId IN ('transfer/to-third-party','transfer/from-third-party') AND t.countAsExpense = true))"
    );

  if (from) qb.andWhere("t.date >= :from", { from });
  if (to) qb.andWhere("t.date <= :to", { to });
  if (householdId) qb.andWhere("t.householdId = :hid", { hid: householdId });
  if (userId !== undefined && userId !== null && userId !== "") {
    if (userId === "__shared__") {
      qb.andWhere("t.userId IS NULL");
    } else {
      qb.andWhere("t.userId = :uid", { uid: userId });
    }
  }

  const rows = await qb.groupBy("t.categoryId").getRawMany();
  return rows
    .map((r) => ({
      categoryId: r.categoryId,
      total: parseFloat(r.total) || 0,
      count: parseInt(r.count, 10) || 0,
    }))
    .filter((r) => r.total < 0 && !isExcludedFromSpending(r.categoryId));
}

export async function getSpendingByOwner(
  from?: string,
  to?: string,
  householdId?: string,
  filterUserId?: string | null
): Promise<SpendingByOwner[]> {
  if (householdId) {
    const rows = await getSpendingByOwnerWithSplit(from, to, householdId, filterUserId);
    if (filterUserId && filterUserId !== "__shared__") {
      return rows.filter((r) => r.userId === filterUserId);
    }
    return rows;
  }
  const qb = dataSource
    .getRepository(Transaction)
    .createQueryBuilder("t")
    .select("COALESCE(t.userId::text, 'shared')", "owner")
    .addSelect("t.userId", "userId")
    .addSelect("SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END)", "total")
    .addSelect("SUM(CASE WHEN t.amount < 0 THEN 1 ELSE 0 END)", "count")
    .where("t.amount != 0")
    .andWhere("(t.isExcludedFromAnalytics = false OR t.isExcludedFromAnalytics IS NULL)")
    .andWhere(
      "(t.categoryId NOT LIKE 'transfer/%' OR (t.categoryId IN ('transfer/to-third-party','transfer/from-third-party') AND t.countAsExpense = true))"
    );

  if (from) qb.andWhere("t.date >= :from", { from });
  if (to) qb.andWhere("t.date <= :to", { to });

  const rows = await qb.groupBy("t.userId").getRawMany();
  return rows
    .map((r) => ({
      owner: r.owner ?? "shared",
      userId: r.userId,
      total: parseFloat(r.total) || 0,
      count: parseInt(r.count, 10) || 0,
    }))
    .filter((r) => r.total < 0);
}

/** Spending per user; for household view. Shared txns (userId null) use getSharedExpenseSplit. */
async function getSpendingByOwnerWithSplit(
  from?: string,
  to?: string,
  householdId?: string,
  filterUserId?: string | null
): Promise<SpendingByOwner[]> {
  const { User } = await import("../entities/User");
  const users = await dataSource.getRepository(User).find({ where: { householdId: householdId! } });
  const userIds = users.map((u) => u.id);
  const sharedSplit = await getSharedExpenseSplit(householdId!);

  const qb = dataSource
    .getRepository(Transaction)
    .createQueryBuilder("t")
    .select("t.id", "id")
    .addSelect("t.amount", "amount")
    .addSelect("t.userId", "userId")
    .where("t.amount < 0")
    .andWhere("(t.householdId = :hid OR t.householdId IS NULL)", { hid: householdId })
    .andWhere("(t.isExcludedFromAnalytics = false OR t.isExcludedFromAnalytics IS NULL)")
    .andWhere(
      "(t.categoryId NOT LIKE 'transfer/%' OR (t.categoryId IN ('transfer/to-third-party','transfer/from-third-party') AND t.countAsExpense = true))"
    );

  if (from) qb.andWhere("t.date >= :from", { from });
  if (to) qb.andWhere("t.date <= :to", { to });
  if (filterUserId === "__shared__") {
    qb.andWhere("t.userId IS NULL");
  } else if (filterUserId && filterUserId !== "__shared__") {
    qb.andWhere("t.userId = :uid", { uid: filterUserId });
  }

  const rows = await qb.getRawMany();

  if (filterUserId === "__shared__") {
    const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    return total < 0 ? [{ owner: "Shared", userId: null, total, count: rows.length }] : [];
  }

  const byUser: Record<string, { total: number; count: number }> = {};
  for (const uid of userIds) byUser[uid] = { total: 0, count: 0 };

  for (const r of rows) {
    const amount = parseFloat(r.amount) || 0;
    const txnUserId = r.userId as string | null;
    if (txnUserId && byUser[txnUserId]) {
      byUser[txnUserId].total += amount;
      byUser[txnUserId].count += 1;
    } else {
      const split = Object.keys(sharedSplit).length > 0 ? sharedSplit : Object.fromEntries(userIds.map((uid) => [uid, 1 / userIds.length]));
      for (const uid of userIds) {
        const pct = split[uid] ?? 0;
        if (pct > 0) {
          byUser[uid].total += amount * pct;
          byUser[uid].count += 1;
        }
      }
    }
  }

  return userIds.map((uid) => ({
    owner: users.find((u) => u.id === uid)?.nickname ?? uid,
    userId: uid,
    total: byUser[uid].total,
    count: byUser[uid].count,
  })).filter((r) => r.total < 0);
}

export interface SpendingByMonthCategory {
  month: string;
  categoryId: string;
  categoryName?: string;
  total: number;
}

export async function getSpendingByMonthAndCategory(
  year: number,
  householdId?: string,
  userId?: string | null
): Promise<SpendingByMonthCategory[]> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const qb = dataSource
    .getRepository(Transaction)
    .createQueryBuilder("t")
    .select("SUBSTRING(t.date::text, 1, 7)", "month")
    .addSelect("t.categoryId", "categoryId")
    .addSelect("SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END)", "total")
    .where("t.amount != 0")
    .andWhere("t.date >= :from", { from })
    .andWhere("t.date <= :to", { to })
    .andWhere("(t.isExcludedFromAnalytics = false OR t.isExcludedFromAnalytics IS NULL)")
    .andWhere(
      "(t.categoryId NOT LIKE 'transfer/%' OR (t.categoryId IN ('transfer/to-third-party','transfer/from-third-party') AND t.countAsExpense = true))"
    );

  if (householdId) {
    qb.andWhere("t.householdId = :hid", { hid: householdId });
  }
  if (userId !== undefined && userId !== null && userId !== "") {
    if (userId === "__shared__") {
      qb.andWhere("t.userId IS NULL");
    } else {
      qb.andWhere("t.userId = :uid", { uid: userId });
    }
  }

  const rows = await qb
    .groupBy("SUBSTRING(t.date::text, 1, 7)")
    .addGroupBy("t.categoryId")
    .orderBy("month")
    .addOrderBy("t.categoryId")
    .getRawMany();

  return rows
    .map((r) => ({
      month: r.month,
      categoryId: r.categoryId,
      total: parseFloat(r.total) || 0,
    }))
    .filter((r) => r.total < 0 && !isExcludedFromSpending(r.categoryId));
}

export async function getSpendingByMonth(
  from?: string,
  to?: string,
  householdId?: string,
  userId?: string | null
): Promise<SpendingByMonth[]> {
  const qb = dataSource
    .getRepository(Transaction)
    .createQueryBuilder("t")
    .select("SUBSTRING(t.date::text, 1, 7)", "month")
    .addSelect("SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END)", "total")
    .addSelect("SUM(CASE WHEN t.amount < 0 THEN 1 ELSE 0 END)", "count")
    .where("t.amount != 0")
    .andWhere("(t.isExcludedFromAnalytics = false OR t.isExcludedFromAnalytics IS NULL)")
    .andWhere(
      "(t.categoryId NOT LIKE 'transfer/%' OR (t.categoryId IN ('transfer/to-third-party','transfer/from-third-party') AND t.countAsExpense = true))"
    );

  if (from) qb.andWhere("t.date >= :from", { from });
  if (to) qb.andWhere("t.date <= :to", { to });
  if (householdId) qb.andWhere("t.householdId = :hid", { hid: householdId });
  if (userId !== undefined && userId !== null && userId !== "") {
    if (userId === "__shared__") {
      qb.andWhere("t.userId IS NULL");
    } else {
      qb.andWhere("t.userId = :uid", { uid: userId });
    }
  }

  const rows = await qb.groupBy("SUBSTRING(t.date::text, 1, 7)").orderBy("month").getRawMany();
  return rows
    .map((r) => ({
      month: r.month,
      total: parseFloat(r.total) || 0,
      count: parseInt(r.count, 10) || 0,
    }))
    .filter((r) => r.total < 0);
}

export interface TransfersInsight {
  ownAccountTransfers: {
    count: number;
    totalMoved: number;
    unlinked: number;
  };
  householdMemberTransfers: Array<{
    fromUserId: string;
    toUserId: string;
    count: number;
    totalAmount: number;
  }>;
  thirdPartyTransfers: {
    outgoing: { count: number; total: number };
    incoming: { count: number; total: number };
  };
}

export async function getTransfersInsight(
  householdId: string,
  month?: string
): Promise<TransfersInsight> {
  const repo = dataSource.getRepository(Transaction);
  const monthStart = month ? `${month}-01` : new Date().toISOString().slice(0, 7) + "-01";
  const monthEnd = month
    ? new Date(parseInt(month.slice(0, 4), 10), parseInt(month.slice(5, 7), 10), 0)
        .toISOString()
        .slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const ownAccount = await repo
    .createQueryBuilder("t")
    .select("COUNT(*)", "count")
    .addSelect("COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0)", "totalMoved")
    .addSelect(
      "SUM(CASE WHEN t.linkedTransactionId IS NULL THEN 1 ELSE 0 END)",
      "unlinked"
    )
    .where("t.householdId = :hid", { hid: householdId })
    .andWhere("t.categoryId = 'transfer/own-account'")
    .andWhere("t.date >= :from", { from: monthStart })
    .andWhere("t.date <= :to", { to: monthEnd })
    .getRawOne();

  const householdMemberRows = await repo
    .createQueryBuilder("t")
    .select("t.userId", "fromUserId")
    .addSelect("t.transferCounterpartyUserId", "toUserId")
    .addSelect("COUNT(*)", "count")
    .addSelect("SUM(t.amount)", "totalAmount")
    .where("t.householdId = :hid", { hid: householdId })
    .andWhere("t.categoryId IN ('transfer/to-household-member','transfer/from-household-member')")
    .andWhere("t.date >= :from", { from: monthStart })
    .andWhere("t.date <= :to", { to: monthEnd })
    .andWhere("t.amount != 0")
    .groupBy("t.userId")
    .addGroupBy("t.transferCounterpartyUserId")
    .getRawMany();

  const thirdParty = await repo
    .createQueryBuilder("t")
    .select(
      "SUM(CASE WHEN t.amount < 0 THEN 1 ELSE 0 END)",
      "outCount"
    )
    .addSelect(
      "COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0)",
      "outTotal"
    )
    .addSelect(
      "SUM(CASE WHEN t.amount > 0 THEN 1 ELSE 0 END)",
      "inCount"
    )
    .addSelect(
      "COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0)",
      "inTotal"
    )
    .where("t.householdId = :hid", { hid: householdId })
    .andWhere("t.categoryId IN ('transfer/to-third-party','transfer/from-third-party','transfer/to-external-member','transfer/from-external-member')")
    .andWhere("t.date >= :from", { from: monthStart })
    .andWhere("t.date <= :to", { to: monthEnd })
    .getRawOne();

  return {
    ownAccountTransfers: {
      count: parseInt(ownAccount?.count ?? "0", 10) || 0,
      totalMoved: parseFloat(ownAccount?.totalMoved ?? "0") || 0,
      unlinked: parseInt(ownAccount?.unlinked ?? "0", 10) || 0,
    },
    householdMemberTransfers: householdMemberRows.map((r) => ({
      fromUserId: r.fromUserId ?? "",
      toUserId: r.toUserId ?? "",
      count: parseInt(r.count, 10) || 0,
      totalAmount: parseFloat(r.totalAmount ?? "0") || 0,
    })),
    thirdPartyTransfers: {
      outgoing: {
        count: parseInt(thirdParty?.outCount ?? "0", 10) || 0,
        total: parseFloat(thirdParty?.outTotal ?? "0") || 0,
      },
      incoming: {
        count: parseInt(thirdParty?.inCount ?? "0", 10) || 0,
        total: parseFloat(thirdParty?.inTotal ?? "0") || 0,
      },
    },
  };
}

export function computeMonthlySavingsTarget(
  targetAmount: number,
  currentAmount: number,
  targetDate: string
): SavingsSuggestion {
  const remaining = Math.max(0, targetAmount - currentAmount);
  const target = new Date(targetDate);
  const now = new Date();
  const monthsRemaining = Math.max(
    1,
    Math.ceil((target.getTime() - now.getTime()) / (30 * 24 * 60 * 60 * 1000))
  );
  const monthlyTarget = remaining / monthsRemaining;
  return {
    goalId: "",
    monthlyTarget,
    monthsRemaining,
    remainingAmount: remaining,
  };
}
