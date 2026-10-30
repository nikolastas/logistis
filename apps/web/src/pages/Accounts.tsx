import { useState } from "react";
import { Link } from "react-router-dom";
import { FinanceFrame, FinanceLoadState, Notice, Stat, ledgerName, ledgerStatusLabel, money, tableClass, useFinanceData } from "../components/FinanceViews";
import { ledgerStatus } from "../lib/financeLedger";
import { currentBudgetMonth } from "../lib/budgetMonths";

export function Accounts() {
  const data = useFinanceData(); const [onlyReview, setOnlyReview] = useState(false);
  const current = currentBudgetMonth(new Date());
  const counts = { review: 0, partial: 0, matches: 0, unavailable: 0 };
  for (const ledger of data.ledgers) counts[ledgerStatus(ledger)]++;
  const shown = data.ledgers.filter((ledger) => !onlyReview || ledgerStatus(ledger) !== "matches" || ledger.missingMonths.length > 0 || ledger.rows[ledger.rows.length - 1].date.slice(0, 7) < current);
  return <FinanceFrame title="Account reconciliation" description="Check imported movements against bank running balances, find possible duplicates and see where transaction history may be missing.">
    <FinanceLoadState data={data} />
    {data.household && data.query.isSuccess && <div className="space-y-5">
      <Notice>These are record groups by bank, recorded owner, product and currency. Expense ownership can be edited, and several bank accounts may share a group. A balance match checks the imported ledger; it does not independently verify the bank account or prove that every statement is present.</Notice>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Record groups" value={String(data.ledgers.length)} /><Stat label="Running balances match" value={String(counts.matches)} detail="All rows checked, with no detected discrepancies" /><Stat label="Need balance / duplicate review" value={String(counts.review)} /><Stat label="Incomplete or unavailable checks" value={String(counts.partial + counts.unavailable)} /></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyReview} onChange={(event) => setOnlyReview(event.target.checked)} className="h-4 w-4 accent-indigo-600" />Only groups needing attention</label><div className="flex gap-4 text-sm"><Link to="/upload" className="text-indigo-700 underline">Upload statements</Link><Link to="/review" className="text-indigo-700 underline">Review transactions</Link></div></div>
      {!data.ledgers.length && <p className="rounded-xl bg-white p-6">No imported transactions for this household yet.</p>}
      {shown.map((ledger) => {
        const status = ledgerStatus(ledger); const first = ledger.rows[0]; const last = ledger.rows[ledger.rows.length - 1];
        const issues = ledger.issues.filter((issue) => issue.kind !== "order");
        return <section key={ledger.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4 p-5"><div><h2 className="font-semibold text-slate-900">{ledgerName(ledger, data.users)}</h2><p className="mt-1 text-xs text-slate-500">{first.date} to {last.date} · {ledger.rows.length} entries · {ledger.currency}</p></div><span className={"rounded-full px-3 py-1 text-xs font-semibold " + (status === "matches" ? "bg-emerald-50 text-emerald-800" : status === "review" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900")}>{ledgerStatusLabel(status)}</span></div>
          <dl className="grid gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">{[["Inferred opening", money(ledger.opening, ledger.currency)], ["Last recorded balance", money(ledger.closing, ledger.currency)], ["Net movements", money(ledger.net, ledger.currency)], ["Closing difference", money(ledger.difference, ledger.currency)]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}</dl>
          <div className="space-y-2 px-5 pb-5 text-xs leading-5 text-slate-600"><p>Opening is inferred from the first bank balance minus its movement. {ledger.balanceCount} of {ledger.rows.length} entries have a running balance. Last available balance: {ledger.balanceDate ?? "not provided"}.</p>
            {last.date.slice(0, 7) < current && <p className="font-medium text-amber-900">No transaction activity imported after {last.date}. Check whether newer statements are needed.</p>}
            {!!ledger.missingMonths.length && <p className="font-medium text-amber-900">No recorded activity in: {ledger.missingMonths.join(", ")}. These may be quiet months or missing imports.</p>}
            {ledger.issues.some((issue) => issue.kind === "order") && <p className="font-medium text-amber-900">Same-date/time entries cannot be ordered confidently; affected balance steps are not verified.</p>}
          </div>
          {!!issues.length && <details className="border-t border-slate-200"><summary className="cursor-pointer p-4 text-sm font-medium text-red-800">{issues.length} balance discrepancy / possible duplicate findings</summary><div className="max-h-80 overflow-auto"><table className={tableClass}><caption className="sr-only">Reconciliation findings</caption><thead><tr><th>Date</th><th>Finding</th><th>Difference</th><th>Transaction</th></tr></thead><tbody>{issues.map((issue, index) => <tr key={issue.transactionId + index}><td className="whitespace-nowrap">{issue.date}</td><td>{issue.message}</td><td>{issue.difference === null ? "—" : money(issue.difference, ledger.currency)}</td><td>{ledger.rows.find((row) => row.transaction.id === issue.transactionId)?.transaction.description}</td></tr>)}</tbody></table></div></details>}
        </section>;
      })}
      {!!data.ledgers.length && !shown.length && <p className="rounded-xl bg-white p-6">No groups need attention under these checks.</p>}
    </div>}
  </FinanceFrame>;
}
