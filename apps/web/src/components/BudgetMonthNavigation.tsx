import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { adjacentBudgetMonth, isBudgetMonth } from "../lib/budgetMonths";

export function BudgetMonthNavigation({
  month, currentMonth, onChange,
}: {
  month: string;
  currentMonth: string;
  onChange: (month: string) => void;
}) {
  const previous = adjacentBudgetMonth(month, -1);
  const next = adjacentBudgetMonth(month, 1);
  return (
    <section aria-label="Choose budget review month" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label htmlFor="budget-review-month" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <CalendarDays className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          Review month
        </label>
        <button type="button" onClick={() => onChange(currentMonth)} disabled={month === currentMonth}
          className="min-h-9 rounded-lg px-3 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent">
          This month
        </button>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <button type="button" aria-label="Previous month" disabled={!previous} onClick={() => { if (previous) onChange(previous); }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Previous</span>
        </button>
        <input id="budget-review-month" type="month" value={month} min="0001-01" max="9999-12"
          onChange={(event) => { if (isBudgetMonth(event.target.value)) onChange(event.target.value); }}
          className="min-h-11 min-w-0 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-base font-semibold text-slate-900" />
        <button type="button" aria-label="Next month" disabled={!next} onClick={() => { if (next) onChange(next); }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          <span className="hidden sm:inline">Next</span><ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
