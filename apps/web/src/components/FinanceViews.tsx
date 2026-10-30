import { useMemo } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useHousehold } from "../context/HouseholdContext";
import { getFinanceTransactions } from "../api/finance";
import { buildLedgers, type Ledger } from "../lib/financeLedger";
import { currentBudgetMonth, getBudgetReviewMonth, budgetMonthSearch } from "../lib/budgetMonths";

export function useFinanceData() {
  const context = useHousehold();
  const query = useQuery({
    queryKey: ["finance-transactions", context.household?.id],
    queryFn: () => getFinanceTransactions(context.household!.id),
    enabled: !!context.household,
  });
  const transactions = query.data ?? [];
  const ledgers = useMemo(() => buildLedgers(transactions), [query.data]);
  return { ...context, query, transactions, ledgers };
}
export function useFinanceMonth() {
  const [search, setSearch] = useSearchParams();
  const current = currentBudgetMonth(new Date());
  const month = getBudgetReviewMonth(search.get("month"), current);
  return { current, month, setMonth: (next: string) => setSearch(budgetMonthSearch(search, next, current)) };
}
export function money(cents: number | null, currency = "EUR"): string {
  if (cents === null) return "Unavailable";
  try { return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(cents / 100); }
  catch { return (cents / 100).toFixed(2) + " " + currency; }
}
export function ownerName(userId: string | null, users: readonly { id: string; nickname: string }[]) {
  return userId === null ? "Shared" : users.find((user) => user.id === userId)?.nickname ?? "Unknown owner";
}
export function bankLabel(bank: string): string {
  return ({ "nbg-xlsx": "NBG", "nbg": "NBG", "alpha-bank": "Alpha Bank", "revolut": "Revolut", "winbank": "Piraeus", "payzy": "Payzy", "generic-pdf": "PDF import" } as Record<string, string>)[bank] ?? bank;
}
export function ledgerName(ledger: Ledger, users: readonly { id: string; nickname: string }[]) {
  const product = /savings/i.test(ledger.product) && ledger.pocketNames.length === 1 ? ledger.pocketNames[0] : ledger.product;
  return ownerName(ledger.userId, users) + " · " + bankLabel(ledger.bank) + " · " + product;
}
export function FinanceNav() {
  return <nav aria-label="Finance views" className="mb-6 flex flex-wrap gap-2">
    {[["/savings", "Savings"], ["/accounts", "Reconciliation"], ["/budget/forecast", "Spending forecast"]].map(([to, label]) =>
      <NavLink key={to} to={to} className={({ isActive }) => "rounded-xl px-4 py-2 text-sm font-medium " + (isActive ? "bg-indigo-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100")}>{label}</NavLink>)}
  </nav>;
}
export function FinanceFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl"><FinanceNav /><header className="mb-6"><h1 className="text-2xl font-semibold text-slate-900">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p></header>{children}</div>;
}
export function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 break-words text-2xl font-semibold tabular-nums text-slate-900">{value}</p>{detail && <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>}</div>;
}
export function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{children}</div>;
}
export function FinanceLoadState({ data }: { data: ReturnType<typeof useFinanceData> }) {
  if (data.isLoading) return <p role="status">Loading household…</p>;
  if (!data.household) return <p>Select your household in <Link to="/settings" className="text-indigo-700 underline">Settings</Link> to see these records.</p>;
  if (data.query.isPending) return <p role="status">Loading imported transactions…</p>;
  if (data.query.isError) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4"><p>Transactions could not be loaded: {data.query.error instanceof Error ? data.query.error.message : "Request failed"}</p><button onClick={() => void data.query.refetch()} className="mt-3 rounded-lg border border-red-300 px-3 py-2">Try again</button></div>;
  return null;
}
export const tableClass = "w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:py-3 [&_th]:font-medium [&_th]:text-slate-600 [&_td]:px-4 [&_td]:py-3 [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100";

export function ledgerStatusLabel(status: "review" | "partial" | "matches" | "unavailable") {
  return { review: "Needs review", partial: "Partly checked", matches: "Running balances match", unavailable: "Balance not provided" }[status];
}
