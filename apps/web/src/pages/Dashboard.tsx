import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';
import {
  TrendingDown,
  Wallet,
  ArrowRightLeft,
  Target,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  getSpendingInsights,
  getSpendingByMonthCategory,
  type SpendingByMonthCategory,
} from '../api/insights';
import { getTransfersInsight, getHouseholdIncomeSummary } from '../api/households';
import { listGoals } from '../api/goals';
import { useHousehold } from '../context/HouseholdContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
);

const CATEGORY_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
];

function formatEur(n: number): string {
  return `€${Math.abs(n).toFixed(2)}`;
}

function getMonthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function toMonthString(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' as const },
    tooltip: {
      callbacks: {
        label: (ctx: { raw: unknown }) => `${ctx.raw != null ? formatEur(Number(ctx.raw)) : ''}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
    },
    y: {
      beginAtZero: true,
      ticks: {
        callback: (v: number | string) => `€${v}`,
      },
    },
  },
};

type ScopeFilter = 'household' | 'shared' | string; // string = userId

export function Dashboard() {
  const { household, users } = useHousehold();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(() => now.getFullYear());
  const [selectedMonthNum, setSelectedMonthNum] = useState(() => now.getMonth() + 1);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('household');

  const selectedMonth = useMemo(
    () => `${selectedYear}-${String(selectedMonthNum).padStart(2, '0')}`,
    [selectedYear, selectedMonthNum]
  );

  const scopeUserId = useMemo(() => {
    if (scopeFilter === 'household') return undefined;
    if (scopeFilter === 'shared') return '__shared__';
    return scopeFilter;
  }, [scopeFilter]);

  const { from, to } = useMemo(() => getMonthRange(selectedMonth), [selectedMonth]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['insights', household?.id, from, to, scopeUserId],
    queryFn: () =>
      getSpendingInsights({
        householdId: household?.id ?? undefined,
        from,
        to,
        userId: scopeUserId,
      }),
  });

  const { data: transfers } = useQuery({
    queryKey: ['transfers', household?.id, selectedMonth],
    queryFn: () =>
      household ? getTransfersInsight(household.id, selectedMonth) : Promise.resolve(null),
    enabled: !!household,
  });

  const { data: incomeSummary } = useQuery({
    queryKey: ['income-summary', household?.id, selectedMonth],
    queryFn: () =>
      household ? getHouseholdIncomeSummary(household.id, selectedMonth) : Promise.resolve(null),
    enabled: !!household,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: listGoals,
  });

  const { data: monthCategoryData = [] } = useQuery({
    queryKey: ['spending-by-month-category', household?.id, selectedYear, scopeUserId],
    queryFn: () =>
      getSpendingByMonthCategory({
        year: selectedYear,
        householdId: household?.id ?? undefined,
        userId: scopeUserId,
      }),
  });

  const { chartData: yearChartData, categoryKeys } = useMemo(() => {
    type MonthRow = { month: string; [k: string]: string | number };
    const byMonth = new Map<string, MonthRow>();
    const cats = new Set<string>();

    for (const r of monthCategoryData as SpendingByMonthCategory[]) {
      const val = Math.abs(r.total);
      if (val <= 0) continue;
      const key = r.categoryName ?? r.categoryId;
      cats.add(key);
      let row = byMonth.get(r.month);
      if (!row) {
        row = { month: r.month };
        byMonth.set(r.month, row);
      }
      const prev = typeof row[key] === 'number' ? row[key] : 0;
      row[key] = prev + val;
    }

    const now = new Date();
    const isCurrentYear = selectedYear === now.getFullYear();
    const monthCount = isCurrentYear ? now.getMonth() + 1 : 12;
    const allMonths = Array.from({ length: monthCount }, (_, i) =>
      `${selectedYear}-${String(i + 1).padStart(2, '0')}`
    );
    const data = allMonths.map((month) => {
      const row = byMonth.get(month);
      const base: MonthRow = { month };
      if (!row) return base;
      for (const [k, v] of Object.entries(row)) {
        if (k !== 'month') base[k] = v;
      }
      return base;
    });
    return {
      chartData: data,
      categoryKeys: Array.from(cats),
    };
  }, [monthCategoryData, selectedYear]);

  const monthlyTrendsPadded = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const r of monthCategoryData as SpendingByMonthCategory[]) {
      const val = Math.abs(r.total);
      if (val <= 0) continue;
      byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + val);
    }
    const year = selectedYear;
    const allMonths = Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, '0')}`
    );
    const monthToTotal = new Map(Array.from(byMonth.entries()));
    return allMonths.map((month) => ({
      month,
      total: monthToTotal.get(month) ?? 0,
    }));
  }, [monthCategoryData, selectedYear]);

  const prevMonth = () => {
    if (selectedMonthNum <= 1) {
      setSelectedMonthNum(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonthNum((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonthNum >= 12) {
      setSelectedMonthNum(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonthNum((m) => m + 1);
    }
  };

  const canNext = selectedMonth < toMonthString(new Date());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <div className="animate-pulse flex flex-col gap-4 w-full max-w-md">
          <div className="h-8 bg-slate-200 rounded w-1/3" />
          <div className="h-24 bg-slate-200 rounded" />
          <div className="h-64 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        <p className="font-medium">Failed to load dashboard</p>
        <p className="text-sm mt-1">{error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    );
  }

  if (!data) return null;

  const totalSpend = data.byCategory.reduce((s, c) => s + Math.abs(c.total), 0);
  const totalTx = data.totalTransactions ?? 0;
  const pieData = data.byCategory
    .filter((c) => c.total < 0)
    .map((c) => ({
      name: c.categoryName || c.categoryId,
      value: Math.abs(c.total),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const totalIncome = incomeSummary?.total ?? 0;
  const savingsRate =
    totalIncome > 0 && totalSpend > 0 ? ((totalIncome - totalSpend) / totalIncome) * 100 : null;

  const userColor = (userId: string) => users.find((u) => u.id === userId)?.color ?? '#6366f1';

  const categoryPieData = {
    labels: pieData.map((d) => (d.name.length > 18 ? d.name.slice(0, 18) + '…' : d.name)),
    datasets: [
      {
        data: pieData.map((d) => d.value),
        backgroundColor: pieData.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]),
        borderWidth: 1,
        borderColor: '#fff',
      },
    ],
  };

  const monthlyBarData = {
    labels: monthlyTrendsPadded.map((m) => formatMonthLabel(m.month)),
    datasets: [
      {
        label: 'Spent',
        data: monthlyTrendsPadded.map((m) => m.total),
        backgroundColor: monthlyTrendsPadded.map((_, i) =>
          monthlyTrendsPadded[i].total > 0 ? '#3b82f6' : '#e2e8f0'
        ),
        borderRadius: 4,
      },
    ],
  };

  const yearlyLineData = {
    labels: yearChartData.map((d) => formatMonthLabel(d.month)),
    datasets: categoryKeys.map((key, i) => ({
      label: key,
      data: yearChartData.map((d) => Number(d[key] ?? 0)),
      borderColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      backgroundColor: `${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}20`,
      fill: true,
      tension: 0.3,
      stack: 'spending',
    })),
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
          label: (ctx: { raw: unknown; label: string }) => {
            const total = pieData.reduce((s, d) => s + d.value, 0);
            const pct = total > 0 ? ((ctx.raw as number) / total) * 100 : 0;
            return `${ctx.label}: ${formatEur(Number(ctx.raw))} (${pct.toFixed(1)}%)`;
          },
        },
      },
    },
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        position: 'bottom' as const,
        maxWidth: 400,
        labels: { boxWidth: 12, padding: 16 },
      },
      tooltip: {
        callbacks: {
          title: (items: { label?: string }[]) =>
            items.length > 0 ? items[0].label ?? '' : '',
          label: (ctx: {
            raw: unknown;
            dataIndex: number;
            dataset: { label?: string };
            chart: { data: { datasets: { data: unknown[] }[] } };
          }) => {
            const total = ctx.chart.data.datasets.reduce(
              (s, ds) => s + (Number(ds.data[ctx.dataIndex]) ?? 0),
              0
            );
            const pct = total > 0 ? ((Number(ctx.raw) ?? 0) / total) * 100 : 0;
            return `${ctx.dataset.label ?? ''}: ${formatEur(Number(ctx.raw))} (${pct.toFixed(1)}%)`;
          },
          footer: (items: { raw?: unknown }[]) => {
            const total = items.reduce((s, i) => s + (Number(i.raw) ?? 0), 0);
            return `Total: ${formatEur(total)}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { callback: (v: number | string) => `€${v}` },
      },
    },
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i).toLocaleDateString('en-GB', { month: 'long' }),
  }));

  const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">Month</label>
            <div className="flex items-center gap-1">
              <button
                onClick={prevMonth}
                className="p-2 rounded-lg border border-slate-200 hover:bg-white text-slate-600"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedMonthNum}
                onChange={(e) => setSelectedMonthNum(parseInt(e.target.value, 10))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white min-w-[120px]"
              >
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                onClick={nextMonth}
                disabled={!canNext}
                className="p-2 rounded-lg border border-slate-200 hover:bg-white text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white min-w-[80px]"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">Scope</label>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white min-w-[160px]"
            >
              <option value="household">Whole household</option>
              <option value="shared">Shared only</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nickname}
                </option>
              ))}
            </select>
          </div>
          <span className="text-sm text-slate-500 ml-auto">
            Showing {formatMonthLabel(selectedMonth)}
            {scopeFilter === 'household' && ' · Whole household'}
            {scopeFilter === 'shared' && ' · Shared only'}
            {scopeFilter !== 'household' &&
              scopeFilter !== 'shared' &&
              ` · ${users.find((x) => x.id === scopeFilter)?.nickname ?? 'User'}`}
          </span>
        </div>
      </div>

      {totalTx > 0 && totalSpend === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
          {totalTx} transaction{totalTx !== 1 ? 's' : ''} in this period. No expenses detected
          (negative amounts). Check Review to verify.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <TrendingDown className="w-4 h-4" />
            Total spending
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatEur(totalSpend)}</p>
          {totalTx > 0 && <p className="text-xs text-slate-400 mt-1">{totalTx} transactions</p>}
        </div>

        {data.byOwner.map((o, i) => (
          <div
            key={o.userId ?? o.owner ?? i}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: o.userId ? userColor(String(o.userId)) : 'rgb(148 163 184)',
                }}
              />
              {o.owner}
            </div>
            <p className="text-2xl font-bold text-slate-900">{formatEur(o.total || 0)}</p>
            {(o.count ?? 0) > 0 && <p className="text-xs text-slate-400 mt-1">{o.count} txns</p>}
          </div>
        ))}

        {incomeSummary && totalIncome > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <Wallet className="w-4 h-4" />
              Household income
            </div>
            <p className="text-2xl font-bold text-emerald-600">{formatEur(totalIncome)}</p>
            {savingsRate !== null && (
              <p className="text-xs text-slate-500 mt-1">
                Savings rate: {savingsRate >= 0 ? '' : '-'}
                {Math.abs(savingsRate).toFixed(1)}%
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Spending by category</h2>
          {pieData.length > 0 ? (
            <div className="h-[280px]">
              <Pie data={categoryPieData} options={pieOptions} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <TrendingDown className="w-12 h-12 mb-2 opacity-40" />
              <p>No spending data for this period</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Monthly trends ({selectedYear})
          </h2>
          {!monthlyTrendsPadded.every((m) => m.total === 0) ? (
            <div className="h-[280px]">
              <Bar data={monthlyBarData} options={chartOptions} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <TrendingDown className="w-12 h-12 mb-2 opacity-40" />
              <p>No spending data for {selectedYear}</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          Yearly spending by category ({selectedYear})
        </h2>
        {yearChartData.length > 0 && categoryKeys.length > 0 ? (
          <div className="h-[360px]">
            <Line data={yearlyLineData} options={lineOptions} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <TrendingDown className="w-12 h-12 mb-2 opacity-40" />
            <p>No spending data for {selectedYear}</p>
          </div>
        )}
      </div>

      {(transfers || goals.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {transfers &&
            (transfers.ownAccountTransfers.count > 0 ||
              transfers.householdMemberTransfers.length > 0 ||
              transfers.thirdPartyTransfers.outgoing.count > 0 ||
              transfers.thirdPartyTransfers.incoming.count > 0) && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5" />
                  Transfers
                </h2>
                <div className="space-y-3 text-sm">
                  {transfers.ownAccountTransfers.count > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-600">Own account</span>
                      <span>
                        {transfers.ownAccountTransfers.count} txns ·{' '}
                        {formatEur(transfers.ownAccountTransfers.totalMoved)}
                      </span>
                    </div>
                  )}
                  {transfers.householdMemberTransfers.length > 0 &&
                    transfers.householdMemberTransfers.map((hm, i) => {
                      const fromName = hm.fromUserId
                        ? (users.find((u) => u.id === hm.fromUserId)?.nickname ?? 'Shared')
                        : 'Shared';
                      const toName = hm.toUserId
                        ? (users.find((u) => u.id === hm.toUserId)?.nickname ?? '?')
                        : '?';
                      return (
                        <div
                          key={i}
                          className="flex justify-between items-center py-2 border-b border-slate-100"
                        >
                          <span className="text-slate-600">
                            {fromName} → {toName}
                          </span>
                          <span>
                            {hm.count} txns · {formatEur(hm.totalAmount)}
                          </span>
                        </div>
                      );
                    })}
                  {(transfers.thirdPartyTransfers.outgoing.count > 0 ||
                    transfers.thirdPartyTransfers.incoming.count > 0) && (
                    <div className="flex justify-between items-center py-2">
                      <span className="text-slate-600">Third party</span>
                      <span>
                        Out: {formatEur(transfers.thirdPartyTransfers.outgoing.total)} · In:{' '}
                        {formatEur(transfers.thirdPartyTransfers.incoming.total)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

          {goals.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Target className="w-5 h-5" />
                Savings goals
              </h2>
              <div className="space-y-3">
                {goals.slice(0, 3).map((g) => {
                  const progress =
                    Number(g.targetAmount) > 0
                      ? (Number(g.currentAmount) / Number(g.targetAmount)) * 100
                      : 0;
                  return (
                    <div key={g.id} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-700">{g.name}</span>
                        <span className="text-slate-500">
                          {formatEur(Number(g.currentAmount))} / {formatEur(Number(g.targetAmount))}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {goals.length > 3 && (
                  <p className="text-xs text-slate-500 pt-2">+{goals.length - 3} more in Goals</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
