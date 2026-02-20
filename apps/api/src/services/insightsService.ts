import { dataSource } from "../db";
import { Transaction } from "../entities/Transaction";
import { isExcludedFromSpending } from "../categorizer";

export interface SpendingByCategory {
  categoryId: string;
  categoryName?: string;
  total: number;
  count: number;
}

export interface SpendingByOwner {
  owner: string;
  ownerId?: string | null;
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
  to?: string
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
      "(t.transferType IS NULL OR t.transferType = 'none' OR (t.transferType = 'third_party' AND t.countAsExpense = true))"
    );

  if (from) qb.andWhere("t.date >= :from", { from });
  if (to) qb.andWhere("t.date <= :to", { to });

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
  householdId?: string
): Promise<SpendingByOwner[]> {
  if (householdId) {
    return getSpendingByOwnerWithSplit(from, to, householdId);
  }
  const qb = dataSource
    .getRepository(Transaction)
    .createQueryBuilder("t")
    .select("COALESCE(t.ownerId::text, COALESCE(t.owner, 'shared'))", "owner")
    .addSelect("t.ownerId", "ownerId")
    .addSelect("SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END)", "total")
    .addSelect("SUM(CASE WHEN t.amount < 0 THEN 1 ELSE 0 END)", "count")
    .where("t.amount != 0")
    .andWhere("(t.isExcludedFromAnalytics = false OR t.isExcludedFromAnalytics IS NULL)")
    .andWhere(
      "(t.transferType IS NULL OR t.transferType = 'none' OR (t.transferType = 'third_party' AND t.countAsExpense = true))"
    );

  if (from) qb.andWhere("t.date >= :from", { from });
  if (to) qb.andWhere("t.date <= :to", { to });

  const rows = await qb.groupBy("t.ownerId").addGroupBy("t.owner").getRawMany();
  return rows
    .map((r) => ({
      owner: r.owner ?? "shared",
      ownerId: r.ownerId,
      total: parseFloat(r.total) || 0,
      count: parseInt(r.count, 10) || 0,
    }))
    .filter((r) => r.total < 0);
}

/** Spending per user using splitRatio; for household view */
async function getSpendingByOwnerWithSplit(
  from?: string,
  to?: string,
  householdId?: string
): Promise<SpendingByOwner[]> {
  const { User } = await import("../entities/User");
  const users = await dataSource.getRepository(User).find({ where: { householdId: householdId! } });
  const userIds = users.map((u) => u.id);

  const qb = dataSource
    .getRepository(Transaction)
    .createQueryBuilder("t")
    .select("t.id", "id")
    .addSelect("t.amount", "amount")
    .addSelect("t.splitRatio", "splitRatio")
    .addSelect("t.ownerId", "ownerId")
    .where("t.amount < 0")
    .andWhere("(t.householdId = :hid OR t.householdId IS NULL)", { hid: householdId })
    .andWhere("(t.isExcludedFromAnalytics = false OR t.isExcludedFromAnalytics IS NULL)")
    .andWhere(
      "(t.transferType IS NULL OR t.transferType = 'none' OR (t.transferType = 'third_party' AND t.countAsExpense = true))"
    );

  if (from) qb.andWhere("t.date >= :from", { from });
  if (to) qb.andWhere("t.date <= :to", { to });

  const rows = await qb.getRawMany();
  const byUser: Record<string, { total: number; count: number }> = {};
  for (const uid of userIds) byUser[uid] = { total: 0, count: 0 };

  for (const r of rows) {
    const amount = parseFloat(r.amount) || 0;
    const split = (r.splitRatio as Record<string, number>) || {};
    for (const uid of userIds) {
      const pct = Number(split[uid]) || 0;
      if (pct > 0) {
        byUser[uid].total += amount * pct;
        byUser[uid].count += 1;
      }
    }
    if (Object.keys(split).length === 0) {
      const ownerId = r.ownerId;
      if (ownerId && byUser[ownerId]) {
        byUser[ownerId].total += amount;
        byUser[ownerId].count += 1;
      } else {
        const n = userIds.length;
        for (const uid of userIds) {
          byUser[uid].total += amount / n;
          byUser[uid].count += 1;
        }
      }
    }
  }

  return userIds.map((uid) => ({
    owner: users.find((u) => u.id === uid)?.nickname ?? uid,
    ownerId: uid,
    total: byUser[uid].total,
    count: byUser[uid].count,
  })).filter((r) => r.total < 0);
}

export async function getSpendingByMonth(
  from?: string,
  to?: string
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
      "(t.transferType IS NULL OR t.transferType = 'none' OR (t.transferType = 'third_party' AND t.countAsExpense = true))"
    );

  if (from) qb.andWhere("t.date >= :from", { from });
  if (to) qb.andWhere("t.date <= :to", { to });

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
    .andWhere("t.transferType = 'own_account'")
    .andWhere("t.date >= :from", { from: monthStart })
    .andWhere("t.date <= :to", { to: monthEnd })
    .getRawOne();

  const householdMemberRows = await repo
    .createQueryBuilder("t")
    .select("t.ownerId", "fromUserId")
    .addSelect("t.transferCounterpartyUserId", "toUserId")
    .addSelect("COUNT(*)", "count")
    .addSelect("SUM(t.amount)", "totalAmount")
    .where("t.householdId = :hid", { hid: householdId })
    .andWhere("t.transferType = 'household_member'")
    .andWhere("t.date >= :from", { from: monthStart })
    .andWhere("t.date <= :to", { to: monthEnd })
    .andWhere("t.amount != 0")
    .groupBy("t.ownerId")
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
    .andWhere("t.transferType = 'third_party'")
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
