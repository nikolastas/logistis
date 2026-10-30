import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { selectionState, type MerchantGroup } from "../utils/reviewTransactions";

const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

export function MerchantReviewGroup({
  group, categories, selected, expanded, isUpdating, onToggleSelect, onToggleExpand, onCategoryChange, children,
}: {
  group: MerchantGroup;
  categories: Array<{ id: string; name: string }>;
  selected: ReadonlySet<string>;
  expanded: boolean;
  isUpdating: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onCategoryChange: (categoryId: string) => void;
  children?: ReactNode;
}) {
  const count = group.transactions.length;
  const selection = selectionState(selected, group.transactions.map((transaction) => transaction.id));
  const detailsId = `merchant-${encodeURIComponent(group.key)}`;
  return (
    <section className="rounded-lg border border-slate-200 bg-white" aria-label={`${group.name}, ${count} transactions`}>
      <div className="flex flex-col gap-4 p-4 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <input
            type="checkbox"
            checked={selection.checked}
            ref={(element) => { if (element) element.indeterminate = selection.indeterminate; }}
            onChange={onToggleSelect}
            aria-label={`Select all ${count} transactions for ${group.name}`}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold text-slate-800">{group.name}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {count} transaction{count === 1 ? "" : "s"}{group.firstDate === group.lastDate
                ? ` on ${group.firstDate}` : ` from ${group.firstDate} to ${group.lastDate}`}
            </p>
            <p className="mt-1 text-xs text-slate-500">{group.bankSources.join(", ")}</p>
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-3 gap-4 text-right sm:gap-6">
          <div>
            <dt className="text-xs text-slate-500">Money out</dt>
            <dd className="mt-1 whitespace-nowrap text-sm font-semibold tabular-nums text-red-700">{money.format(group.moneyOutCents / 100)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Money in</dt>
            <dd className="mt-1 whitespace-nowrap text-sm font-semibold tabular-nums text-emerald-700">{money.format(group.moneyInCents / 100)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Net</dt>
            <dd className="mt-1 whitespace-nowrap text-sm font-semibold tabular-nums text-slate-800">{money.format(group.netCents / 100)}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end xl:flex-col xl:items-stretch">
          <label className="block text-xs text-slate-500">
            Category for {count === 1 ? "this transaction" : `all ${count} transactions`}
            <select
              value={group.categoryId ?? ""}
              disabled={isUpdating}
              onChange={(event) => { if (event.target.value) onCategoryChange(event.target.value); }}
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 disabled:opacity-50 sm:min-w-48"
            >
              {group.categoryId === null && <option value="" disabled>Mixed categories</option>}
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            {expanded ? "Hide transactions" : `Show ${count} transaction${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
      <div id={detailsId} hidden={!expanded} className={expanded ? "border-t border-slate-200 p-3" : ""}>{expanded ? children : null}</div>
    </section>
  );
}
