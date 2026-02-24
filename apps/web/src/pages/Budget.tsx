import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BudgetItem, BudgetPlan } from "@couple-finance/shared";
import { Plus, Trash2, ArrowLeftRight } from "lucide-react";
import { useHousehold } from "../context/HouseholdContext";
import {
  createBudgetItem,
  createBudgetPlan,
  deleteBudgetItem,
  deleteBudgetPlan,
  getBudgetComparison,
  getBudgetPlan,
  getBudgetSummary,
  listBudgetPlans,
  updateBudgetItem,
  updateBudgetPlan,
} from "../api/budgets";
import { getCategories } from "../api/insights";

type DraftItem = {
  userId: string | null;
  name: string;
  amount: string;
  type: "income" | "expense";
  categoryId: string;
};

function toMonthInput(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function euro(v: number): string {
  return `€${v.toFixed(2)}`;
}

function itemOwnerLabel(userId: string | null, userMap: Record<string, string>): string {
  if (!userId) return "Shared";
  return userMap[userId] ?? "Unknown user";
}

export function Budget() {
  const qc = useQueryClient();
  const { household, users } = useHousehold();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [newPlanMonth, setNewPlanMonth] = useState(toMonthInput());
  const [newPlanSavings, setNewPlanSavings] = useState("");
  const [newPlanNotes, setNewPlanNotes] = useState("");
  const [showComparison, setShowComparison] = useState(false);

  const [draftItem, setDraftItem] = useState<DraftItem>({
    userId: null,
    name: "",
    amount: "",
    type: "expense",
    categoryId: "",
  });

  const userMap = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.nickname])),
    [users]
  );

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });
  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.id !== "income"),
    [categories]
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.id === "income"),
    [categories]
  );

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["budget-plans", household?.id],
    queryFn: () => listBudgetPlans(household!.id),
    enabled: !!household,
  });

  const { data: selectedPlan } = useQuery({
    queryKey: ["budget-plan", household?.id, selectedPlanId],
    queryFn: () => getBudgetPlan(household!.id, selectedPlanId!),
    enabled: !!household && !!selectedPlanId,
  });

  const { data: summary } = useQuery({
    queryKey: ["budget-summary", household?.id, selectedPlanId],
    queryFn: () => getBudgetSummary(household!.id, selectedPlanId!),
    enabled: !!household && !!selectedPlanId,
  });

  const { data: comparison } = useQuery({
    queryKey: ["budget-comparison", household?.id, selectedPlanId],
    queryFn: () => getBudgetComparison(household!.id, selectedPlanId!),
    enabled: !!household && !!selectedPlanId && showComparison,
  });

  const createPlan = useMutation({
    mutationFn: () =>
      createBudgetPlan(household!.id, {
        month: newPlanMonth,
        savingsTarget: newPlanSavings.trim() ? Number(newPlanSavings) : null,
        notes: newPlanNotes.trim() ? newPlanNotes.trim() : null,
      }),
    onSuccess: async (plan) => {
      await qc.invalidateQueries({ queryKey: ["budget-plans", household?.id] });
      setSelectedPlanId(plan.id);
      setNewPlanNotes("");
    },
  });

  const savePlanMeta = useMutation({
    mutationFn: (patch: Partial<BudgetPlan>) =>
      updateBudgetPlan(household!.id, selectedPlanId!, patch),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["budget-plans", household?.id] }),
        qc.invalidateQueries({ queryKey: ["budget-plan", household?.id, selectedPlanId] }),
        qc.invalidateQueries({ queryKey: ["budget-summary", household?.id, selectedPlanId] }),
      ]);
    },
  });

  const removePlan = useMutation({
    mutationFn: (id: string) => deleteBudgetPlan(household!.id, id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["budget-plans", household?.id] });
      setSelectedPlanId(null);
    },
  });

  const createItemMutation = useMutation({
    mutationFn: () =>
      createBudgetItem(household!.id, selectedPlanId!, {
        userId: draftItem.userId,
        name: draftItem.name.trim(),
        amount: Number(draftItem.amount),
        type: draftItem.type,
        categoryId: draftItem.categoryId,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["budget-plan", household?.id, selectedPlanId] }),
        qc.invalidateQueries({ queryKey: ["budget-summary", household?.id, selectedPlanId] }),
        qc.invalidateQueries({ queryKey: ["budget-comparison", household?.id, selectedPlanId] }),
        qc.invalidateQueries({ queryKey: ["budget-plans", household?.id] }),
      ]);
      const nextCategory =
        draftItem.type === "income"
          ? incomeCategories[0]?.id ?? "income"
          : expenseCategories[0]?.id ?? "";
      setDraftItem({
        userId: null,
        name: "",
        amount: "",
        type: "expense",
        categoryId: nextCategory,
      });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) => deleteBudgetItem(household!.id, selectedPlanId!, itemId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["budget-plan", household?.id, selectedPlanId] }),
        qc.invalidateQueries({ queryKey: ["budget-summary", household?.id, selectedPlanId] }),
        qc.invalidateQueries({ queryKey: ["budget-comparison", household?.id, selectedPlanId] }),
        qc.invalidateQueries({ queryKey: ["budget-plans", household?.id] }),
      ]);
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: (payload: { id: string; patch: Partial<BudgetItem> }) =>
      updateBudgetItem(household!.id, selectedPlanId!, payload.id, payload.patch),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["budget-plan", household?.id, selectedPlanId] }),
        qc.invalidateQueries({ queryKey: ["budget-summary", household?.id, selectedPlanId] }),
        qc.invalidateQueries({ queryKey: ["budget-comparison", household?.id, selectedPlanId] }),
        qc.invalidateQueries({ queryKey: ["budget-plans", household?.id] }),
      ]);
    },
  });

  if (!household) return null;

  const canAddDraftItem =
    !!selectedPlanId &&
    draftItem.name.trim().length > 0 &&
    draftItem.categoryId &&
    Number(draftItem.amount) >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Budget Planning</h1>
        {selectedPlanId && (
          <button
            onClick={() => setShowComparison((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeftRight className="w-4 h-4" />
            {showComparison ? "Back to Editor" : "Planned vs Actual"}
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <h2 className="font-medium text-slate-800 mb-3">Create monthly plan</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Month</label>
            <input
              type="month"
              value={newPlanMonth}
              onChange={(e) => setNewPlanMonth(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Savings target (optional)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={newPlanSavings}
              onChange={(e) => setNewPlanSavings(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Notes</label>
            <input
              value={newPlanNotes}
              onChange={(e) => setNewPlanNotes(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
        <div className="mt-3">
          <button
            onClick={() => createPlan.mutate()}
            disabled={createPlan.isPending || !newPlanMonth}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {createPlan.isPending ? "Creating..." : "Create Plan"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <h2 className="font-medium text-slate-800 mb-3">Plans</h2>
        {plansLoading ? (
          <p className="text-slate-500">Loading plans...</p>
        ) : plans.length === 0 ? (
          <p className="text-slate-500">No plans yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlanId(p.id)}
                className={`text-left rounded-lg border px-4 py-3 ${
                  p.id === selectedPlanId
                    ? "border-slate-700 bg-slate-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">{p.month}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                    {p.status}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  Planned expenses: {euro(p.totalPlanned)}
                </p>
                <p className="text-xs text-slate-500 mt-1">{p.itemCount} items</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPlan && !showComparison && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Month</label>
                <input
                  type="month"
                  value={selectedPlan.month}
                  onChange={(e) =>
                    savePlanMeta.mutate({ month: e.target.value })
                  }
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Status</label>
                <select
                  value={selectedPlan.status}
                  onChange={(e) =>
                    savePlanMeta.mutate({
                      status: e.target.value as "draft" | "active" | "closed",
                    })
                  }
                  className="w-full rounded border border-slate-300 px-3 py-2"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Savings target</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={selectedPlan.savingsTarget ?? ""}
                  onBlur={(e) =>
                    savePlanMeta.mutate({
                      savingsTarget: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </div>
              <div className="flex items-end justify-end">
                <button
                  onClick={() => removePlan.mutate(selectedPlan.id)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Plan
                </button>
              </div>
            </div>
          </div>

          {summary && (
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
              <h3 className="font-medium text-slate-800 mb-2">Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-slate-500">Income</p>
                  <p className="text-lg font-semibold text-slate-800">{euro(summary.household.totalIncome)}</p>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-slate-500">Expenses</p>
                  <p className="text-lg font-semibold text-slate-800">{euro(summary.household.totalExpenses)}</p>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-slate-500">Savings target</p>
                  <p className="text-lg font-semibold text-slate-800">{euro(summary.household.savingsTarget)}</p>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-slate-500">Balance</p>
                  <p className="text-lg font-semibold text-slate-800">{euro(summary.household.balance)}</p>
                </div>
              </div>
              {summary.users.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2">User</th>
                        <th className="py-2">PCT</th>
                        <th className="py-2">Income</th>
                        <th className="py-2">Personal expenses</th>
                        <th className="py-2">Shared share</th>
                        <th className="py-2">Savings</th>
                        <th className="py-2">Free money</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.users.map((u) => (
                        <tr key={u.userId} className="border-b border-slate-100">
                          <td className="py-2">{u.nickname}</td>
                          <td className="py-2">{(u.pct * 100).toFixed(1)}%</td>
                          <td className="py-2">{euro(u.income)}</td>
                          <td className="py-2">{euro(u.personalExpenses)}</td>
                          <td className="py-2">{euro(u.sharedExpenseShare)}</td>
                          <td className="py-2">{euro(u.savingsTarget)}</td>
                          <td className="py-2">{euro(u.freeMoney)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <h3 className="font-medium text-slate-800 mb-2">Add Item</h3>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <select
                value={draftItem.userId ?? "__shared__"}
                onChange={(e) =>
                  setDraftItem((prev) => ({
                    ...prev,
                    userId: e.target.value === "__shared__" ? null : e.target.value,
                  }))
                }
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="__shared__">Shared</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nickname}
                  </option>
                ))}
              </select>
              <input
                value={draftItem.name}
                onChange={(e) => setDraftItem((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Item name"
                className="rounded border border-slate-300 px-3 py-2"
              />
              <input
                type="number"
                step="0.01"
                min={0}
                value={draftItem.amount}
                onChange={(e) => setDraftItem((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="Amount"
                className="rounded border border-slate-300 px-3 py-2"
              />
              <select
                value={draftItem.type}
                onChange={(e) => {
                  const nextType = e.target.value as "income" | "expense";
                  const nextCategory =
                    nextType === "income"
                      ? incomeCategories[0]?.id ?? "income"
                      : expenseCategories[0]?.id ?? "";
                  setDraftItem((prev) => ({
                    ...prev,
                    type: nextType,
                    categoryId: nextCategory,
                  }));
                }}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <select
                value={draftItem.categoryId}
                onChange={(e) => setDraftItem((prev) => ({ ...prev, categoryId: e.target.value }))}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Category</option>
                {(draftItem.type === "income" ? incomeCategories : expenseCategories).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => createItemMutation.mutate()}
                disabled={!canAddDraftItem || createItemMutation.isPending}
                className="rounded bg-slate-700 text-white px-3 py-2 hover:bg-slate-600 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <h3 className="font-medium text-slate-800 mb-2">Items</h3>
            {selectedPlan.items && selectedPlan.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2">Owner</th>
                      <th className="py-2">Name</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Category</th>
                      <th className="py-2">Amount</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPlan.items.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="py-2">{itemOwnerLabel(item.userId, userMap)}</td>
                        <td className="py-2">
                          <input
                            value={item.name}
                            onBlur={(e) =>
                              e.target.value !== item.name &&
                              updateItemMutation.mutate({
                                id: item.id,
                                patch: { name: e.target.value },
                              })
                            }
                            className="rounded border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="py-2">
                          <select
                            value={item.type}
                            onChange={(e) =>
                              updateItemMutation.mutate({
                                id: item.id,
                                patch: { type: e.target.value as "income" | "expense" },
                              })
                            }
                            className="rounded border border-slate-300 px-2 py-1"
                          >
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                          </select>
                        </td>
                        <td className="py-2">
                          <select
                            value={item.categoryId}
                            onChange={(e) =>
                              updateItemMutation.mutate({
                                id: item.id,
                                patch: { categoryId: e.target.value },
                              })
                            }
                            className="rounded border border-slate-300 px-2 py-1"
                          >
                            {(item.type === "income" ? incomeCategories : expenseCategories).map(
                              (c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              )
                            )}
                          </select>
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={item.amount}
                            onBlur={(e) =>
                              updateItemMutation.mutate({
                                id: item.id,
                                patch: { amount: Number(e.target.value) || 0 },
                              })
                            }
                            className="w-28 rounded border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => removeItemMutation.mutate(item.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-500">No items in this plan yet.</p>
            )}
          </div>
        </div>
      )}

      {selectedPlan && showComparison && comparison && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <h3 className="font-medium text-slate-800 mb-3">Planned vs Actual ({selectedPlan.month})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2">Owner</th>
                  <th className="py-2">Item</th>
                  <th className="py-2">Category</th>
                  <th className="py-2">Planned</th>
                  <th className="py-2">Actual</th>
                  <th className="py-2">Diff</th>
                </tr>
              </thead>
              <tbody>
                {comparison.items.map((i) => {
                  const isOver = i.difference > 0;
                  return (
                    <tr key={i.budgetItemId} className="border-b border-slate-100">
                      <td className="py-2">{itemOwnerLabel(i.userId, userMap)}</td>
                      <td className="py-2">{i.name}</td>
                      <td className="py-2">{categoryMap[i.categoryId] ?? i.categoryId}</td>
                      <td className="py-2">{euro(i.planned)}</td>
                      <td className="py-2">{euro(i.actual)}</td>
                      <td className={`py-2 ${isOver ? "text-red-600" : "text-emerald-600"}`}>
                        {euro(i.difference)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className="py-2" colSpan={3}>
                    Totals
                  </td>
                  <td className="py-2">{euro(comparison.totalPlanned)}</td>
                  <td className="py-2">{euro(comparison.totalActual)}</td>
                  <td className={comparison.totalDifference > 0 ? "text-red-600" : "text-emerald-600"}>
                    {euro(comparison.totalDifference)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
