import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBudgetPlan, listBudgetPlans } from "../api/budgets";
import { getCategories } from "../api/insights";
import { BudgetMonthNavigation } from "../components/BudgetMonthNavigation";
import { FinanceFrame, FinanceLoadState, Notice, Stat, bankLabel, money, ownerName, tableClass, useFinanceData, useFinanceMonth } from "../components/FinanceViews";
import { buildForecast, inScope } from "../lib/spendingForecast";

const defaultOneOff = ["travel", "refunds", "cash"];
export function SpendingForecast() {
  const data = useFinanceData(); const { month, current, setMonth } = useFinanceMonth();
  const [scope, setScope] = useState("shared");
  const [includeCash, setIncludeCash] = useState(false);
  const [oneOff, setOneOff] = useState<string[]>(defaultOneOff);
  useEffect(() => {
    setScope("shared"); setIncludeCash(false); setOneOff(defaultOneOff);
    if (!data.household) return;
    try {
      const saved = JSON.parse(localStorage.getItem("finance-forecast:" + data.household.id) ?? "null");
      if (saved && Array.isArray(saved.oneOff) && saved.oneOff.every((item: unknown) => typeof item === "string")) {
        setOneOff(saved.oneOff); setIncludeCash(saved.includeCash === true);
      }
    } catch { /* Use the defaults if a saved preference is unavailable. */ }
  }, [data.household?.id]);
  const savePreferences = (nextOneOff: string[], nextCash: boolean) => {
    setOneOff(nextOneOff); setIncludeCash(nextCash);
    if (data.household) try { localStorage.setItem("finance-forecast:" + data.household.id, JSON.stringify({ oneOff: nextOneOff, includeCash: nextCash })); } catch { /* The view still works without storage. */ }
  };
  const plans = useQuery({ queryKey: ["budget-plans", data.household?.id], queryFn: () => listBudgetPlans(data.household!.id), enabled: !!data.household });
  const selectedPlan = plans.data?.find((plan) => plan.month === month);
  const plan = useQuery({ queryKey: ["budget-plan", data.household?.id, selectedPlan?.id], queryFn: () => getBudgetPlan(data.household!.id, selectedPlan!.id), enabled: !!data.household && !!selectedPlan });
  const categoryQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const categoryNames = new Map((categoryQuery.data ?? []).map((category) => [category.id, category.name]));
  const today = current + "-" + String(new Date().getDate()).padStart(2, "0");
  const forecast = useMemo(() => buildForecast(data.transactions, { month, today, scope, items: plan.data?.items ?? [], oneOffCategories: oneOff, includeCash }), [data.query.data, month, today, scope, plan.data, oneOff, includeCash]);
  const stale = month > current ? [] : data.ledgers.filter((ledger) => inScope(ledger.userId, scope) && ledger.rows[ledger.rows.length - 1].date.slice(0, 7) < month);
  const oldSources = [...new Set(stale.map((ledger) => bankLabel(ledger.bank) + " · " + ownerName(ledger.userId, data.users)))];
  const budgetLoaded = plans.isSuccess && (!selectedPlan || plan.isSuccess);
  const hasBudget = budgetLoaded && !!plan.data;
  return <FinanceFrame title="Monthly spending forecast" description="Compare recorded spending with the selected budget and estimate month-end spending from the imported pace. Default view: shared household expenses.">
    <FinanceLoadState data={data} />
    {data.household && data.query.isSuccess && <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2"><BudgetMonthNavigation month={month} currentMonth={current} onChange={setMonth} /><div className="rounded-2xl border border-slate-200 bg-white p-4"><label htmlFor="forecast-scope" className="mb-2 block text-sm font-medium">Spending scope</label><select id="forecast-scope" value={scope} onChange={(event) => setScope(event.target.value)} className="w-full rounded-lg border border-slate-300 p-3"><option value="shared">Shared expenses</option><option value="household">Whole household</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.nickname} · personal expenses</option>)}</select><p className="mt-3 text-xs leading-5 text-slate-500">Personal views include that person's own transactions and budget lines. Shared expenses stay in the Shared view.</p></div></div>
      {(plans.isError || plan.isError) && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">The budget could not be loaded. Recorded spending is still shown; budget comparisons are unavailable. <button onClick={() => { void plans.refetch(); if (selectedPlan) void plan.refetch(); }} className="underline">Try again</button></div>}
      {!budgetLoaded && !plans.isError && !plan.isError && <p role="status" className="text-sm text-slate-500">Loading the selected month's budget…</p>}
      {budgetLoaded && !hasBudget && <Notice>No budget exists for {month}. <Link to={"/budget?month=" + month} className="underline">Create this month's budget</Link> to see remaining allowances and overspend estimates.</Notice>}
      <Notice>{forecast.future ? "This is a future month. A spending pace is not available yet." : forecast.past ? "This is a historical month. The total shows recorded activity rather than a projection." : "Projection uses activity imported through " + (forecast.observedThrough ?? "no recorded date") + ". Recurring spending is scaled by calendar days; one-off categories are counted once. This estimate does not predict bill due dates."} {oldSources.length > 0 && <>Some source groups have no activity imported for this month: {oldSources.join("; ")}. They may be inactive or missing newer imports. <Link to="/accounts" className="underline">Check reconciliation</Link>.</>}</Notice>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Recorded spending" value={money(forecast.actual)} detail={forecast.observedThrough ? "Through " + forecast.observedThrough : "No activity imported for this month"} /><Stat label="Planned expenses" value={hasBudget ? money(forecast.planned) : "Not available"} detail={hasBudget ? "Matching budget lines for this scope" : "Select a month with a saved budget"} /><Stat label={forecast.past ? "Recorded month total" : "Estimated month-end spending"} value={money(forecast.projected)} detail={forecast.projected === null ? "Not enough elapsed activity to estimate" : "Includes one-off categories once"} /><Stat label="Budget remaining" value={hasBudget ? money(forecast.remaining) : "Not available"} detail={hasBudget && forecast.dailyAllowance !== null ? money(forecast.dailyAllowance) + " per remaining calendar day · " + forecast.remainingDays + " days" : "Negative means over budget"} /></div>
      {hasBudget && forecast.projected !== null && <div className={"rounded-xl border p-4 text-sm " + (forecast.projected > forecast.planned ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>{forecast.past ? "Recorded spending is " : "Estimated month-end spending is "}{money(Math.abs(forecast.projected - forecast.planned))} {forecast.projected > forecast.planned ? "above" : "within"} the planned expense total for this scope. {forecast.unbudgeted > 0 && <span>{money(forecast.unbudgeted)} is in categories with no expense budget.</span>}</div>}
      {(forecast.cash > 0 || forecast.unknownDebits > 0 || forecast.unknownCredits > 0 || forecast.creditCardPayments > 0 || forecast.foreignTransactions > 0) && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">Check before relying on this forecast</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-950">
        {forecast.cash > 0 && <li>{money(forecast.cash)} in cash withdrawals {includeCash ? "is included. Check that cash purchases have not also been imported." : "is excluded until you choose to include it below."}</li>}
        {forecast.unknownDebits > 0 && <li>{money(forecast.unknownDebits)} of outgoing entries is uncategorised and included in spending.</li>}
        {forecast.unknownCredits > 0 && <li>{money(forecast.unknownCredits)} of uncategorised credits is not treated as refunds.</li>}
        {forecast.creditCardPayments > 0 && <li>{money(forecast.creditCardPayments)} may be credit-card repayments. Check whether the underlying purchases are also imported.</li>}
        {forecast.foreignTransactions > 0 && <li>{forecast.foreignTransactions} non-EUR entries are excluded because no exchange rate is recorded.</li>}
      </ul><Link to="/review" className="mt-3 inline-block text-sm text-amber-950 underline">Review transactions</Link></section>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Forecast assumptions</h2><p className="mt-1 text-sm leading-6 text-slate-600">Choose categories to count once rather than repeat their pace for the rest of the month. For a holiday month, select the categories containing holiday spending. Settings are saved on this device.</p>
        <fieldset className="mt-4"><legend className="mb-2 text-sm font-medium">One-off categories</legend><div className="flex flex-wrap gap-2">{[...new Set([...forecast.categories.map((category) => category.categoryId), ...oneOff])].sort().map((id) => <label key={id} className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " + (oneOff.includes(id) ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-slate-200")}><input type="checkbox" checked={oneOff.includes(id)} onChange={(event) => savePreferences(event.target.checked ? [...oneOff, id] : oneOff.filter((item) => item !== id), includeCash)} className="h-4 w-4 accent-indigo-600" />{categoryNames.get(id) ?? id}</label>)}</div></fieldset>
        <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={includeCash} onChange={(event) => savePreferences(oneOff, event.target.checked)} className="h-4 w-4 accent-indigo-600" />Include cash withdrawals in recorded spending</label>
        <p className="mt-3 text-xs leading-5 text-slate-500">Income, internal transfers, excluded entries, investments and loan principal are omitted. An external transfer is included only when explicitly marked as an expense. EUR totals use the imported amounts.</p>
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex flex-wrap justify-between gap-3 p-5"><div><h2 className="font-semibold">Spending by category</h2><p className="mt-1 text-xs text-slate-500">Credits offset the same category; unclassified credits do not reduce spending.</p></div><Link to={"/budget?month=" + month} className="text-sm text-indigo-700 underline">Edit budget</Link></div><div className="overflow-x-auto"><table className={tableClass}><caption className="sr-only">Budget, recorded spending and projected spending by category</caption><thead><tr><th>Category</th><th>Budget</th><th>Recorded</th><th>{forecast.past ? "Recorded total" : "Projected"}</th><th>Remaining</th><th>Method</th></tr></thead><tbody>{forecast.categories.map((category) => <tr key={category.categoryId}><td className="font-medium">{categoryNames.get(category.categoryId) ?? category.categoryId}{category.planned === 0 && category.actual > 0 && <span className="ml-2 text-xs text-amber-800">Unbudgeted</span>}</td><td>{hasBudget ? money(category.planned) : "—"}</td><td>{money(category.actual)}</td><td>{money(category.projected)}</td><td className={category.actual > category.planned && hasBudget ? "text-red-700" : ""}>{hasBudget ? money(category.planned - category.actual) : "—"}</td><td>{forecast.past ? "Recorded" : category.oneOff ? "Count once" : "Elapsed-day pace"}</td></tr>)}</tbody></table>{!forecast.categories.length && <p className="p-5 text-sm text-slate-500">No spending or budget categories for this scope and month.</p>}</div></section>
    </div>}
  </FinanceFrame>;
}
