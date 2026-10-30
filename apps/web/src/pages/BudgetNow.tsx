import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Landmark,
  PiggyBank,
  ReceiptText,
  RefreshCw,
  Send,
  UserRound,
} from "lucide-react";
import type { BudgetTransferKind } from "../lib/budgetReview";
import { buildBudgetReview } from "../lib/budgetReview";
import { getBudgetSummary, listBudgetPlans } from "../api/budgets";
import { useHousehold } from "../context/HouseholdContext";

import { BudgetMonthNavigation } from "../components/BudgetMonthNavigation";
import { budgetMonthSearch, currentBudgetMonth, getBudgetReviewMonth } from "../lib/budgetMonths";

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, monthNumber - 1, 1);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

function euro(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

const transferPresentation: Record<
  BudgetTransferKind,
  { icon: ComponentType<{ className?: string }>; iconClass: string; label: string }
> = {
  "shared-expenses": {
    icon: Landmark,
    iconClass: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    label: "Household expenses",
  },
  "shared-savings": {
    icon: PiggyBank,
    iconClass: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    label: "Savings",
  },
  member: {
    icon: UserRound,
    iconClass: "bg-amber-50 text-amber-700 ring-amber-100",
    label: "Reimbursement",
  },
};

export function BudgetNow() {
  const { household, users } = useHousehold();
  const [searchParams, setSearchParams] = useSearchParams();
  const thisMonth = currentBudgetMonth();
  const month = getBudgetReviewMonth(searchParams.get("month"), thisMonth);
  const budgetPlanningPath = `/budget?month=${month}`;
  const changeMonth = (nextMonth: string) =>
    setSearchParams((previous) => budgetMonthSearch(previous, nextMonth, thisMonth));
  const renderWithMonthNavigation = (content: ReactNode) => (
    <div className="mx-auto max-w-2xl space-y-5">
      <BudgetMonthNavigation month={month} currentMonth={thisMonth} onChange={changeMonth} />
      {content}
    </div>
  );
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? "");

  useEffect(() => {
    if (users.length === 0) {
      setSelectedUserId("");
      return;
    }
    if (!users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
    }
  }, [selectedUserId, users]);

  const plansQuery = useQuery({
    queryKey: ["budget-plans", household?.id],
    queryFn: () => listBudgetPlans(household!.id),
    enabled: !!household,
  });

  const selectedPlan = useMemo(
    () => (plansQuery.data ?? []).find((plan) => plan.month === month),
    [month, plansQuery.data]
  );

  const summaryQuery = useQuery({
    queryKey: ["budget-summary", household?.id, selectedPlan?.id],
    queryFn: () => getBudgetSummary(household!.id, selectedPlan!.id),
    enabled: !!household && !!selectedPlan,
  });

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const selectedSummary = summaryQuery.data?.users.find(
    (user) => user.userId === selectedUserId
  );
  const review = useMemo(
    () =>
      summaryQuery.data && selectedUserId
        ? buildBudgetReview(summaryQuery.data, selectedUserId)
        : null,
    [selectedUserId, summaryQuery.data]
  );

  if (plansQuery.isPending) {
    return renderWithMonthNavigation(
      <div className="mx-auto max-w-2xl animate-pulse space-y-4" aria-label="Loading review">
        <div className="h-6 w-36 rounded bg-slate-200" />
        <div className="h-28 rounded-3xl bg-slate-200" />
        <div className="h-44 rounded-2xl bg-slate-200" />
      </div>
    );
  }

  if (plansQuery.isError) {
    return renderWithMonthNavigation(
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Couldn’t load the selected month</h1>
        <p className="mt-2 text-sm text-slate-600">
          {plansQuery.error instanceof Error
            ? plansQuery.error.message
            : "The budget service did not respond."}
        </p>
        <button
          type="button"
          onClick={() => plansQuery.refetch()}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </div>
    );
  }

  if (!selectedPlan) {
    return renderWithMonthNavigation(
      <div className="mx-auto max-w-xl">
        <Link
          to={budgetPlanningPath}
          className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Budget planning
        </Link>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
          <CalendarDays className="mx-auto h-11 w-11 text-indigo-600" />
          <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-indigo-600">
            {formatMonth(month)}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">No budget to review yet</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
            Create a budget for {formatMonth(month)} first. Once it has expenses and a savings target,
            this page will turn them into a transfer checklist.
          </p>
          <Link
            to={budgetPlanningPath}
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            Open budget planning
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (summaryQuery.isError) {
    return renderWithMonthNavigation(
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Couldn’t calculate transfers</h1>
        <p className="mt-2 text-sm text-slate-600">
          {summaryQuery.error instanceof Error
            ? summaryQuery.error.message
            : "The budget summary did not respond."}
        </p>
        <button
          type="button"
          onClick={() => summaryQuery.refetch()}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </div>
    );
  }

  if (users.length === 0) {
    return renderWithMonthNavigation(
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
        <UserRound className="mx-auto h-11 w-11 text-indigo-600" />
        <h1 className="mt-3 text-2xl font-bold text-slate-950">Add a household member</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
          A member is needed before the app can calculate who should fund each account.
        </p>
        <Link
          to="/settings"
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white"
        >
          Open household settings
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (summaryQuery.isPending || !review || !selectedUser) {
    return renderWithMonthNavigation(
      <div className="mx-auto max-w-2xl animate-pulse space-y-4" aria-label="Calculating transfers">
        <div className="h-20 rounded-2xl bg-slate-200" />
        <div className="h-52 rounded-3xl bg-slate-200" />
        <div className="h-28 rounded-2xl bg-slate-200" />
      </div>
    );
  }

  const destinationCount = review.outgoing.length;
  const splitPercentage = Math.round((selectedSummary?.pct ?? 0) * 100);

  return renderWithMonthNavigation(
    <div className="mx-auto max-w-2xl space-y-5 pb-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
            <CalendarDays className="h-4 w-4" />
            {formatMonth(month)}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Monthly money review
          </h1>
          <p className="mt-1 text-sm text-slate-600">{household?.name}</p>
        </div>
        <Link
          to={budgetPlanningPath}
          className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Edit budget
        </Link>
      </header>

      <section aria-labelledby="member-selector-label" className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <p id="member-selector-label" className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Review transfers for
        </p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Household member">
          {users.map((user) => {
            const isSelected = user.id === selectedUserId;
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                aria-pressed={isSelected}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  isSelected
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full ring-2 ring-white/70"
                  style={{ backgroundColor: user.color }}
                />
                {user.nickname}
              </button>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-lg shadow-slate-200 sm:p-7">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Send className="h-4 w-4" />
          {selectedUser.nickname} should send
        </div>
        <p className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          {euro(review.totalToSend)}
        </p>
        <p className="mt-2 text-sm text-slate-300">
          {destinationCount === 0
            ? "No transfers needed for this month"
            : `Across ${destinationCount} ${destinationCount === 1 ? "destination" : "destinations"}`}
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-200">
          <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/10">
            {splitPercentage}% shared-expense share
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/10">
            {selectedPlan.status} budget
          </span>
        </div>
      </section>

      <section aria-labelledby="send-list-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="send-list-title" className="text-lg font-bold text-slate-950">
              Where to send it
            </h2>
            <p className="text-sm text-slate-500">Transfer checklist for {formatMonth(month)}</p>
          </div>
          {destinationCount > 0 && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
              {destinationCount} to do
            </span>
          )}
        </div>

        {review.outgoing.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
            <h3 className="mt-2 font-semibold text-emerald-950">Nothing to send</h3>
            <p className="mt-1 text-sm text-emerald-800">
              {selectedUser.nickname} is fully covered for {formatMonth(month)}.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {review.outgoing.map((instruction) => {
              const presentation = transferPresentation[instruction.kind];
              const Icon = presentation.icon;
              return (
                <article
                  key={instruction.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${presentation.iconClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {presentation.label}
                      </p>
                      <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                        <h3 className="truncate text-base font-bold text-slate-950">
                          {instruction.destination}
                        </h3>
                        <p className="shrink-0 text-2xl font-bold tracking-tight text-slate-950">
                          {euro(instruction.amount)}
                        </p>
                      </div>
                      <p className="mt-1 text-sm leading-5 text-slate-600">
                        {instruction.description}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {review.incoming.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5" aria-labelledby="incoming-title">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="incoming-title" className="flex items-center gap-2 font-bold text-emerald-950">
                <ArrowDownLeft className="h-5 w-5" />
                Expected back
              </h2>
              <p className="mt-1 text-sm text-emerald-800">Other members should reimburse {selectedUser.nickname}</p>
            </div>
            <p className="text-xl font-bold text-emerald-950">{euro(review.totalExpectedBack)}</p>
          </div>
          <div className="mt-3 divide-y divide-emerald-200">
            {review.incoming.map((instruction) => (
              <div key={instruction.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-emerald-950">From {instruction.destination}</p>
                  <p className="truncate text-xs text-emerald-800">{instruction.description}</p>
                </div>
                <p className="shrink-0 font-bold text-emerald-950">{euro(instruction.amount)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <ReceiptText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-950">How this is calculated</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Shared-account and savings contributions follow {selectedUser.nickname}’s
              household share. Expenses already covered by a member are removed from the
              shared-account amount and shown as a net reimbursement instead.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
