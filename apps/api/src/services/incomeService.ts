import { IsNull } from "typeorm";
import { dataSource } from "../db";
import { Income } from "../entities/Income";
import { User } from "../entities/User";

export async function getActiveIncome(userId: string): Promise<Income | null> {
  const repo = dataSource.getRepository(Income);
  return repo.findOne({
    where: { userId, effectiveTo: IsNull() },
    order: { effectiveFrom: "DESC" },
  });
}

export interface HouseholdIncomeBreakdown {
  userId: string;
  nickname: string;
  netMonthlySalary: number;
  perkCardsTotal?: number;
}

export interface HouseholdMonthlyIncome {
  total: number;
  breakdown: HouseholdIncomeBreakdown[];
}

export async function getHouseholdMonthlyIncome(
  householdId: string,
  month: Date
): Promise<HouseholdMonthlyIncome> {
  const monthStart = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const monthEnd = lastDay.toISOString().slice(0, 10);

  const incomeRepo = dataSource.getRepository(Income);
  const userRepo = dataSource.getRepository(User);

  const users = await userRepo.find({ where: { householdId } });
  const breakdown: HouseholdIncomeBreakdown[] = [];
  let total = 0;

  for (const user of users) {
    const active = await incomeRepo
      .createQueryBuilder("i")
      .leftJoinAndSelect("i.incomePerkCards", "ipc")
      .leftJoinAndSelect("ipc.perkCard", "pc")
      .where("i.userId = :userId", { userId: user.id })
      .andWhere("i.effectiveFrom <= :monthEnd", { monthEnd })
      .andWhere("(i.effectiveTo IS NULL OR i.effectiveTo >= :monthStart)", { monthStart })
      .orderBy("i.effectiveFrom", "DESC")
      .getOne();

    if (active) {
      const net = parseFloat(String(active.netMonthlySalary));
      const perkTotal =
        (active.incomePerkCards ?? []).reduce((s, ipc) => {
          const val = ipc.monthlyValue != null ? Number(ipc.monthlyValue) : (ipc.perkCard ? Number(ipc.perkCard.monthlyValue) : 0);
          return s + val;
        }, 0);
      total += net + perkTotal;
      breakdown.push({
        userId: user.id,
        nickname: user.nickname,
        netMonthlySalary: net,
        perkCardsTotal: perkTotal,
      });
    }
  }

  return { total, breakdown };
}

/** Returns shared expense split: from users' expenseShare if set, else income-based. { [userId]: proportion } summing to 1 */
export async function getSharedExpenseSplit(householdId: string): Promise<Record<string, number>> {
  const users = await dataSource.getRepository(User).find({ where: { householdId } });
  const shares = users
    .filter((u) => u.expenseShare != null && Number(u.expenseShare) > 0)
    .map((u) => ({ userId: u.id, share: Number(u.expenseShare) }));
  if (shares.length === users.length && shares.length > 0) {
    const sum = shares.reduce((s, x) => s + x.share, 0);
    if (sum > 0) {
      return Object.fromEntries(shares.map(({ userId, share }) => [userId, share / sum]));
    }
  }
  const result = await getHouseholdMonthlyIncome(householdId, new Date());
  if (result.breakdown.length === 0) return {};
  const totalNet = result.breakdown.reduce(
    (s, b) => s + b.netMonthlySalary + (b.perkCardsTotal ?? 0),
    0
  );
  if (totalNet <= 0) {
    const n = result.breakdown.length;
    return Object.fromEntries(result.breakdown.map((b) => [b.userId, 1 / n]));
  }
  return Object.fromEntries(
    result.breakdown.map((b) => {
      const userTotal = b.netMonthlySalary + (b.perkCardsTotal ?? 0);
      return [b.userId, userTotal / totalNet];
    })
  );
}
