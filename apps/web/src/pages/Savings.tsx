import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listBudgetPlans } from "../api/budgets";
import { BudgetMonthNavigation } from "../components/BudgetMonthNavigation";
import { FinanceFrame, FinanceLoadState, Notice, Stat, ledgerName, money, tableClass, useFinanceData, useFinanceMonth } from "../components/FinanceViews";
import { ledgerStatus, moneyCents, monthlySavings, savingsLedgers, savingsPeriod } from "../lib/financeLedger";

export function Savings() {
  const data = useFinanceData(); const { month, current, setMonth } = useFinanceMonth();
  const [selected, setSelected] = useState(""); const [allActivity, setAllActivity] = useState(false);
  const pockets = useMemo(() => savingsLedgers(data.ledgers), [data.ledgers]);
  const ledger = pockets.find((pocket) => pocket.id === selected) ?? pockets.find((pocket) => pocket.userId === null) ?? pockets[0];
  const plans = useQuery({ queryKey: ["budget-plans", data.household?.id], queryFn: () => listBudgetPlans(data.household!.id), enabled: !!data.household });
  const plan = plans.data?.find((item) => item.month === month);
  const target = ledger?.userId === null ? moneyCents(plan?.savingsTarget ?? data.household?.defaultSavingsTarget) : null;
  const ready = !!data.household && data.query.isSuccess;
  const period = ledger ? savingsPeriod(ledger, month) : null;
  const history = ledger ? monthlySavings(ledger) : [];
  const activity = ledger && period ? [...(allActivity ? ledger.rows : period.rows)].reverse() : [];
  return <FinanceFrame title="Savings" description="Recorded Pocket balances, money added and money taken out. These balances come from imported statements and are not live bank balances.">
    <FinanceLoadState data={data} />
    {ready && !ledger && <div className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">No Revolut Pocket records yet</h2><p className="mt-2 text-sm text-slate-600">Import a Revolut account statement containing Savings/Pocket rows. A manual savings goal does not establish a bank balance.</p><Link to="/upload" className="mt-4 inline-block text-indigo-700 underline">Upload a statement</Link></div>}
    {ready && ledger && period && <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-4"><label htmlFor="savings-ledger" className="mb-2 block text-sm font-medium">Pocket record group</label><select id="savings-ledger" value={ledger.id} onChange={(event) => setSelected(event.target.value)} className="w-full rounded-lg border border-slate-300 p-3">{pockets.map((pocket) => <option key={pocket.id} value={pocket.id}>{ledgerName(pocket, data.users)} · {pocket.currency}</option>)}</select><p className="mt-3 text-xs leading-5 text-slate-500">Grouped by bank, recorded owner and product. Multiple Pocket names in one export stay together when individual balances cannot be separated.</p></div><BudgetMonthNavigation month={month} currentMonth={current} onChange={setMonth} /></div>
      {ledger.pocketNames.length > 1 && <Notice>This group includes {ledger.pocketNames.join(", ")}. The export does not identify the Pocket for every movement; the balance represents the imported Savings ledger, not an individual Pocket.</Notice>}
      {ledgerStatus(ledger) !== "matches" && <Notice>Some balance checks are incomplete or need review. <Link to="/accounts" className="underline">Check reconciliation</Link> before treating this ledger as complete.</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Last recorded balance" value={money(ledger.closing, ledger.currency)} detail={"Balance dated " + (ledger.balanceDate ?? "unknown") + " · " + ledger.rows.length + " recorded movements"} />
        <Stat label={"Added · " + month} value={money(period.incoming, ledger.currency)} detail="Pocket credits, counted once" />
        <Stat label={"Taken out · " + month} value={money(period.outgoing, ledger.currency)} detail="Withdrawals and transfers from the Pocket" />
        <Stat label={"Net change · " + month} value={money(period.net, ledger.currency)} detail={"Month-end recorded balance: " + money(period.closing, ledger.currency) + (period.balanceDate ? " (last movement " + period.balanceDate + ")" : "")} />
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Monthly savings target</h2><p className="mt-1 text-sm text-slate-600">Net money added this month compared with the household budget target.</p></div><Link to={"/budget?month=" + month} className="text-sm text-indigo-700 underline">Edit budget target</Link></div>
        {ledger.userId !== null ? <p className="mt-4 text-sm text-slate-500">The household target applies to Shared savings.</p> : plans.isError ? <p role="alert" className="mt-4 text-sm text-red-700">The target could not be loaded.</p> : plans.isPending ? <p className="mt-4 text-sm text-slate-500">Loading target…</p> : target !== null && target > 0 ? <div className="mt-4"><p className="mb-2 text-sm">{money(period.net, ledger.currency)} net of {money(target)} target {plan ? "" : "(household default)"}</p>{ledger.currency === "EUR" ? <><progress aria-label="Monthly net savings against target" value={Math.max(0, Math.min(target, period.net))} max={target} className="h-3 w-full accent-indigo-600" /><p className="mt-2 text-sm text-slate-600">{period.net >= target ? "Target reached in the imported records." : money(target - period.net) + " more net savings to reach the target."}</p></> : <p className="text-sm text-amber-800">The budget target is in EUR; a different currency cannot be compared without conversion.</p>}</div> : <p className="mt-4 text-sm text-slate-500">No monthly target is set.</p>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Recorded balance by month</h2><p className="mt-1 text-xs text-slate-500">Months without activity carry the previous recorded balance; this does not verify an unimported statement.</p><SavingsTrend points={history.map((point) => ({ month: point.month, value: point.closing }))} currency={ledger.currency} />
        <div className="mt-4 overflow-x-auto"><table className={tableClass}><caption className="sr-only">Monthly Pocket inflows, outflows and recorded balances</caption><thead><tr><th>Month</th><th>Added</th><th>Taken out</th><th>Net</th><th>Recorded balance</th></tr></thead><tbody>{[...history].reverse().map((point) => <tr key={point.month} className={point.month === month ? "bg-indigo-50" : ""}><td><button onClick={() => { setMonth(point.month); setAllActivity(false); }} className="font-medium text-indigo-700 underline">{point.month}</button></td><td>{money(point.incoming, ledger.currency)}</td><td>{money(point.outgoing, ledger.currency)}</td><td>{money(point.net, ledger.currency)}</td><td>{money(point.closing, ledger.currency)}</td></tr>)}</tbody></table></div>
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="font-semibold">{allActivity ? "All Pocket activity" : "Pocket activity · " + month}</h2><p className="mt-1 text-xs text-slate-500">Only the Savings side is shown, so matching current-account transfers are not counted again.</p></div><button onClick={() => setAllActivity(!allActivity)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">{allActivity ? "Selected month" : "All activity"}</button></div><div className="overflow-x-auto"><table className={tableClass}><caption className="sr-only">Pocket transactions and bank running balances</caption><thead><tr><th>Date</th><th>Description</th><th>Movement</th><th>Running balance</th></tr></thead><tbody>{activity.map((row) => <tr key={row.transaction.id}><td className="whitespace-nowrap">{row.date}</td><td>{row.transaction.description}</td><td className={row.amount < 0 ? "text-red-700" : "text-emerald-700"}>{money(row.amount, ledger.currency)}</td><td>{money(row.balance, ledger.currency)}</td></tr>)}</tbody></table>{!activity.length && <p className="p-5 text-sm text-slate-500">No Pocket movements recorded for this month.</p>}</div></section>
    </div>}
  </FinanceFrame>;
}
function SavingsTrend({ points, currency }: { points: { month: string; value: number | null }[]; currency: string }) {
  const available = points.filter((point): point is { month: string; value: number } => point.value !== null);
  if (!available.length) return <p className="mt-4 text-sm text-slate-500">No recorded balances to chart.</p>;
  const min = Math.min(0, ...available.map((point) => point.value)); const max = Math.max(...available.map((point) => point.value), min + 1);
  const x = (index: number) => 40 + index / Math.max(1, available.length - 1) * 620;
  const y = (value: number) => 160 - (value - min) / (max - min) * 130;
  return <svg viewBox="0 0 700 205" role="img" aria-label="Monthly recorded savings balances; exact amounts are in the table below" className="mt-5 w-full">
    <line x1="40" y1="165" x2="660" y2="165" stroke="#cbd5e1" />
    <polyline fill="none" stroke="#4f46e5" strokeWidth="3" points={available.map((point, index) => x(index) + "," + y(point.value)).join(" ")} />
    {available.map((point, index) => <g key={point.month}><circle cx={x(index)} cy={y(point.value)} r="4" fill="#4f46e5"><title>{point.month + ": " + money(point.value, currency)}</title></circle>{(index === 0 || index === available.length - 1) && <text x={x(index)} y="190" textAnchor={index === 0 ? "start" : "end"} fontSize="12" fill="#475569">{point.month}</text>}</g>)}
    <text x="40" y="18" fontSize="12" fill="#475569">{money(max, currency)}</text>
  </svg>;
}
