import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getSpendingInsights } from "../api/insights";
import { useHousehold } from "../context/HouseholdContext";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export function Dashboard() {
  const { household } = useHousehold();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["insights", household?.id],
    queryFn: () => getSpendingInsights({ householdId: household?.id ?? undefined }),
  });

  if (isLoading) return <p className="text-slate-600">Loading...</p>;
  if (isError) return <p className="text-red-600">Error: {error instanceof Error ? error.message : "Failed to load"}</p>;
  if (!data) return null;

  const totalSpend = data.byCategory.reduce((s, c) => s + Math.abs(c.total), 0);
  const totalTx = data.totalTransactions ?? 0;
  const hasExpenses = totalSpend > 0;
  const pieData = data.byCategory
    .filter((c) => c.total < 0)
    .map((c) => ({ name: c.categoryName || c.categoryId, value: Math.abs(c.total) }))
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">Dashboard</h1>

      {totalTx > 0 && !hasExpenses && (
        <p className="mb-4 text-amber-600 text-sm">
          You have {totalTx} transaction{totalTx !== 1 ? "s" : ""}. No expenses detected yet. Expenses are transactions with negative amounts. Check the Review page to verify amounts.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total Spending</p>
          <p className="text-2xl font-bold text-slate-800">€{totalSpend.toFixed(2)}</p>
          {totalTx > 0 && <p className="text-xs text-slate-400 mt-1">{totalTx} transactions</p>}
        </div>
        {data.byOwner.map((o, i) => (
          <div key={o.ownerId ?? o.owner ?? i} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <p className="text-sm text-slate-500">{o.owner}</p>
            <p className="text-2xl font-bold text-slate-800">
              €{Math.abs(o.total || 0).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800 mb-4">Spending by Category</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `€${v.toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 py-12 text-center">No spending data yet</p>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800 mb-4">Monthly Trends</h2>
          {data.byMonth.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `€${v}`} />
                <Tooltip formatter={(v: number) => [`€${Math.abs(v).toFixed(2)}`, "Spent"]} />
                <Legend />
                <Bar dataKey="total" name="Spent" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 py-12 text-center">No monthly data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
