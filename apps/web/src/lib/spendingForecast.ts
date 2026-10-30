import { moneyCents, monthEnd, readLedgerRow, type FinanceTransaction } from "./financeLedger";
export interface ForecastItem { type: string; userId?: string | null; categoryId: string; amount: number | string; }
export interface ForecastOptions {
  month: string; today: string; scope: string; items: readonly ForecastItem[];
  oneOffCategories: readonly string[]; includeCash: boolean;
}
export interface ForecastCategory { categoryId: string; planned: number; debits: number; credits: number; actual: number; projected: number | null; oneOff: boolean; }
export function inScope(userId: string | null | undefined, scope: string): boolean {
  return scope === "household" || (scope === "shared" ? !userId : userId === scope);
}
function expenseEligible(t: FinanceTransaction): boolean {
  if (t.isExcludedFromAnalytics || t.categoryId === "income") return false;
  if (t.categoryId.startsWith("transfer/")) return !/^(transfer\/own-account|transfer\/(?:to|from)-household-member)$/.test(t.categoryId) && !!t.countAsExpense;
  return !["savings", "investment", "trading", "credit", "loan"].includes(t.categoryId);
}
export function buildForecast(transactions: readonly FinanceTransaction[], options: ForecastOptions) {
  const { month, today, scope, items, oneOffCategories, includeCash } = options;
  const end = monthEnd(month); const days = Number(end.slice(8));
  const future = month > today.slice(0, 7); const past = month < today.slice(0, 7);
  const cutoff = end < today ? end : today;
  const selected = transactions.filter((t) => t.date.slice(0, 7) === month && t.date <= cutoff && inScope(t.userId, scope));
  const dated = transactions.filter((t) => t.date.slice(0, 7) === month && t.date <= cutoff && inScope(t.userId, scope)).map((t) => t.date).sort();
  const observedThrough = dated[dated.length - 1] ?? null;
  const elapsed = observedThrough ? Number(observedThrough.slice(8)) : 0;
  const remainingDays = future ? days : past ? 0 : days - Number(today.slice(8)) + 1;
  const groups = new Map<string, ForecastCategory>();
  const group = (categoryId: string) => {
    let value = groups.get(categoryId);
    if (!value) { value = { categoryId, planned: 0, debits: 0, credits: 0, actual: 0, projected: null, oneOff: oneOffCategories.includes(categoryId) }; groups.set(categoryId, value); }
    return value;
  };
  for (const item of items) if (item.type === "expense" && inScope(item.userId, scope)) group(item.categoryId).planned += moneyCents(item.amount) ?? 0;
  let foreignTransactions = 0; let cash = 0; let unknownCredits = 0; let unknownDebits = 0; let excludedMovements = 0; let creditCardPayments = 0;
  for (const t of selected) {
    if (readLedgerRow(t).currency !== "EUR") { foreignTransactions++; continue; }
    const amount = moneyCents(t.amount) ?? 0;
    if (t.categoryId === "cash" && amount < 0) cash -= amount;
    if (t.categoryId === "uncategorized") { if (amount > 0) unknownCredits += amount; else unknownDebits -= amount; }
    if (/ΠΛΗΡΩΜΗ ΠΙΣΤΩΤ|credit card (?:payment|repay)/i.test(t.description) && amount < 0) creditCardPayments -= amount;
    if (!expenseEligible(t) || (t.categoryId === "cash" && !includeCash)) { excludedMovements++; continue; }
    // Unclassified positive entries may be income; do not treat them as refunds.
    if (amount > 0 && ["uncategorized", "cash", "cashback", "euro-from-others"].includes(t.categoryId)) continue;
    const value = group(t.categoryId);
    if (amount < 0) value.debits -= amount; else value.credits += amount;
  }
  const canProject = !future && (past || elapsed > 0);
  for (const value of groups.values()) {
    value.actual = value.debits - value.credits;
    value.projected = !canProject ? null : past || value.oneOff ? value.actual : Math.round(value.actual * days / elapsed);
  }
  const categories = [...groups.values()].sort((a, b) => b.actual - a.actual || a.categoryId.localeCompare(b.categoryId));
  const planned = categories.reduce((sum, c) => sum + c.planned, 0);
  const actual = categories.reduce((sum, c) => sum + c.actual, 0);
  const projected = canProject ? categories.reduce((sum, c) => sum + (c.projected ?? 0), 0) : null;
  const remaining = planned - actual;
  return { categories, planned, actual, projected, remaining, remainingDays,
    dailyAllowance: planned > 0 && remainingDays > 0 ? Math.max(0, Math.floor(remaining / remainingDays)) : null,
    observedThrough, elapsed, days, future, past, cash, unknownCredits, unknownDebits, excludedMovements, creditCardPayments, foreignTransactions,
    unbudgeted: categories.filter((c) => c.planned === 0 && c.actual > 0).reduce((sum, c) => sum + c.actual, 0),
  };
}
