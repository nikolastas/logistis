import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTransactions,
  updateTransaction,
  bulkUpdateTransactions,
  bulkDeleteTransactions,
  type Transaction,
} from "../api/transactions";
import { getCategories, flattenCategoryOptions } from "../api/insights";
import { useHousehold } from "../context/HouseholdContext";
import type { User } from "@couple-finance/shared";

import { MerchantReviewGroup } from "../components/MerchantReviewGroup";
import {
  groupTransactionsByMerchant, selectionState, sortMerchantGroups, sortTransactions,
  toggleTransactionSelection, type MerchantSort, type TransactionSort,
} from "../utils/reviewTransactions";

const EMPTY_TRANSACTIONS: Transaction[] = [];

const isOwnAccount = (c: string) => c === "transfer/own-account";
const isHouseholdMember = (c: string) =>
  c === "transfer/to-household-member" || c === "transfer/from-household-member";
const isThirdParty = (c: string) =>
  c === "transfer/to-third-party" ||
  c === "transfer/from-third-party" ||
  c === "transfer/to-external-member" ||
  c === "transfer/from-external-member";

function TransferDetailPanel({
  transaction,
  users,
  onUpdate,
  onClose,
}: {
  transaction: Transaction;
  users: User[];
  onUpdate: (data: Parameters<typeof updateTransaction>[1]) => void;
  onClose: () => void;
}) {
  const cat = transaction.categoryId;

  if (isOwnAccount(cat)) {
    return (
      <div className="text-sm">
        <p className="text-slate-600 mb-2">
          {transaction.linkedTransactionId
            ? "Matched leg found and linked."
            : "No matching leg found yet. Upload the other bank statement to auto-link."}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onUpdate({ categoryId: "uncategorized", isExcludedFromAnalytics: false })}
            className="px-3 py-1 text-sm border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
          >
            Not a transfer
          </button>
          <button onClick={onClose} className="px-3 py-1 text-sm text-slate-600 hover:text-slate-800">
            Close
          </button>
        </div>
      </div>
    );
  }

  if (isHouseholdMember(cat)) {
    const toUser = users.find((u) => u.id === transaction.transferCounterpartyUserId);
    const fromUser = transaction.userId ? users.find((u) => u.id === transaction.userId) : null;
    const toLabel = toUser?.nickname ?? "?";
    const iconFromTo = transaction.amount < 0 ? "→" : "←";
    return (
      <div className="text-sm">
        <p className="text-slate-600 mb-2">
          {fromUser?.nickname ?? "Shared"} {iconFromTo} {toLabel}
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onUpdate({ categoryId: "transfer/own-account" })}
            className="px-3 py-1 text-sm border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
          >
            Reclassify: Own Account
          </button>
          <button
            onClick={() =>
              onUpdate({
                categoryId: transaction.amount < 0 ? "transfer/to-third-party" : "transfer/from-third-party",
                transferCounterpartyUserId: null,
              })
            }
            className="px-3 py-1 text-sm border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
          >
            Reclassify: Third Party
          </button>
          <button
            onClick={() => onUpdate({ categoryId: "uncategorized" })}
            className="px-3 py-1 text-sm border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
          >
            Not a transfer
          </button>
          <button onClick={onClose} className="px-3 py-1 text-sm text-slate-600 hover:text-slate-800">
            Close
          </button>
        </div>
      </div>
    );
  }

  if (isThirdParty(cat)) {
    return (
      <div className="text-sm">
        <p className="text-slate-600 mb-2">
          Counterparty: {users.find((u) => u.id === transaction.transferCounterpartyUserId)?.nickname ?? "External"}
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onUpdate({ countAsExpense: true })}
            className="px-3 py-1 text-sm bg-slate-700 text-white rounded hover:bg-slate-600"
          >
            This is an expense
          </button>
          <button
            onClick={() => onUpdate({ isExcludedFromAnalytics: true })}
            className="px-3 py-1 text-sm border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
          >
            Exclude from analytics
          </button>
          <button
            onClick={() => onUpdate({ categoryId: "uncategorized" })}
            className="px-3 py-1 text-sm border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
          >
            Not a transfer
          </button>
          <button onClick={onClose} className="px-3 py-1 text-sm text-slate-600 hover:text-slate-800">
            Close
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export function Review() {
  const { household, users } = useHousehold();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkOwner, setBulkOwner] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "unreviewed" | "transfers">("all");
  const [view, setView] = useState<"merchants" | "transactions">("merchants");
  const [transactionSort, setTransactionSort] = useState<TransactionSort>("date-desc");
  const [merchantSort, setMerchantSort] = useState<MerchantSort>("out-desc");
  const [expandedMerchants, setExpandedMerchants] = useState<Set<string>>(new Set());

  const [filterInputs, setFilterInputs] = useState({
    description: "",
    from: "",
    to: "",
    category: "",
    userId: "",
    amountMin: "",
    amountMax: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<typeof filterInputs>({
    description: "",
    from: "",
    to: "",
    category: "",
    userId: "",
    amountMin: "",
    amountMax: "",
  });
  const [expandedTransferId, setExpandedTransferId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const applyFilters = () => setAppliedFilters({ ...filterInputs });

  const { data: transactions = EMPTY_TRANSACTIONS, isLoading } = useQuery({
    queryKey: ["transactions", appliedFilters, filterTab, household?.id],
    queryFn: () =>
      listTransactions({
        ...(appliedFilters.description && { description: appliedFilters.description }),
        ...(appliedFilters.from && { from: appliedFilters.from }),
        ...(appliedFilters.to && { to: appliedFilters.to }),
        ...(appliedFilters.category && { category: appliedFilters.category }),
        ...(appliedFilters.userId && { userId: appliedFilters.userId }),
        ...(household?.id && { householdId: household.id }),
        ...(appliedFilters.amountMin && { amountMin: appliedFilters.amountMin }),
        ...(appliedFilters.amountMax && { amountMax: appliedFilters.amountMax }),
        ...(filterTab === "transfers" && { transferType: "transfers" }),
        ...(filterTab === "unreviewed" && { category: "uncategorized" }),
      }),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });
  const categoryOptions = flattenCategoryOptions(categories);
  const sortedTransactions = useMemo(() => sortTransactions(transactions, transactionSort), [transactions, transactionSort]);
  const merchantGroups = useMemo(
    () => sortMerchantGroups(groupTransactionsByMerchant(transactions), merchantSort),
    [transactions, merchantSort],
  );
  const activeSelected = useMemo(
    () => new Set(transactions.filter((transaction) => selected.has(transaction.id)).map((transaction) => transaction.id)),
    [selected, transactions],
  );
  const allSelection = selectionState(activeSelected, transactions.map((transaction) => transaction.id));
  const allMerchantsExpanded = merchantGroups.length > 0 && merchantGroups.every((group) => expandedMerchants.has(group.key));

  useEffect(() => {
    setSelected(new Set());
    setBulkCategory("");
    setBulkOwner("");
    setExpandedMerchants(new Set());
    setShowDeleteConfirm(false);
  }, [appliedFilters, filterTab, household?.id]);

  useEffect(() => {
    const visibleIds = new Set(transactions.map((transaction) => transaction.id));
    setSelected((previous) => {
      const next = new Set([...previous].filter((id) => visibleIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [transactions]);


  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateTransaction>[1] }) =>
      updateTransaction(id, data!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  });

  const bulkUpdate = useMutation({
    mutationFn: (data: { categoryId?: string; userId?: string | null }) =>
      bulkUpdateTransactions(Array.from(activeSelected), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setSelected(new Set());
      setBulkCategory("");
      setBulkOwner("");
    },
  });

  const merchantUpdate = useMutation({
    mutationFn: ({ ids, categoryId }: { ids: string[]; categoryId: string }) =>
      bulkUpdateTransactions(ids, { categoryId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setSelected(new Set());
      setBulkCategory("");
      setBulkOwner("");
    },
  });

  const bulkDelete = useMutation({
    mutationFn: () => bulkDeleteTransactions(Array.from(activeSelected)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setSelected(new Set());
      setShowDeleteConfirm(false);
    },
  });

  const handleCategoryChange = (t: Transaction, categoryId: string) => {
    update.mutate({ id: t.id, data: { categoryId } });
  };

  const handleOwnerChange = (t: Transaction, newUserId: string | null) => {
    update.mutate({
      id: t.id,
      data: { userId: newUserId },
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectRows = (rows: readonly Transaction[]) => {
    setSelected((previous) => toggleTransactionSelection(previous, rows.map((transaction) => transaction.id)));
  };

  const toggleMerchant = (key: string) => {
    setExpandedMerchants((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleBulkApply = () => {
    const data: { categoryId?: string; userId?: string | null } = {};
    if (bulkCategory) data.categoryId = bulkCategory;
    if (bulkOwner) data.userId = bulkOwner || null;
    if (Object.keys(data).length === 0) return;
    bulkUpdate.mutate(data);
  };

  const hasActiveFilters =
    appliedFilters.description ||
    appliedFilters.from ||
    appliedFilters.to ||
    appliedFilters.category ||
    appliedFilters.userId ||
    appliedFilters.amountMin ||
    appliedFilters.amountMax;
  const clearFilters = () => {
    const empty = {
      description: "",
      from: "",
      to: "",
      category: "",
      userId: "",
      amountMin: "",
      amountMax: "",
    };
    setFilterInputs(empty);
    setAppliedFilters(empty);
  };

  const renderTransactionTable = (rows: Transaction[]) => (
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left">
                <input
                  type="checkbox"
                  checked={selectionState(activeSelected, rows.map((transaction) => transaction.id)).checked}
                  ref={(element) => {
                    if (element) element.indeterminate = selectionState(activeSelected, rows.map((transaction) => transaction.id)).indeterminate;
                  }}
                  aria-label="Select all transactions in this table"
                  onChange={() => toggleSelectRows(rows)}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase" aria-sort={transactionSort === "date-desc" ? "descending" : transactionSort === "date-asc" ? "ascending" : "none"}>
                <button type="button" onClick={() => setTransactionSort(transactionSort === "date-desc" ? "date-asc" : "date-desc")} className="inline-flex items-center gap-1">
                  Date {transactionSort === "date-desc" ? "↓" : transactionSort === "date-asc" ? "↑" : ""}
                </button>
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase">Description</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-600 uppercase" aria-sort={transactionSort === "amount-desc" ? "descending" : transactionSort === "amount-asc" ? "ascending" : "none"}>
                <button type="button" title="Sort by amount size, including payments and credits" onClick={() => setTransactionSort(transactionSort === "amount-desc" ? "amount-asc" : "amount-desc")} className="inline-flex items-center gap-1">
                  Amount {transactionSort === "amount-desc" ? "↓" : transactionSort === "amount-asc" ? "↑" : ""}
                </button>
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase">Category</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase">Owner</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase">Transfer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((t) => (
              <React.Fragment key={t.id}>
              <tr className={`hover:bg-slate-50 ${activeSelected.has(t.id) ? "bg-slate-100" : ""}`}>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={activeSelected.has(t.id)}
                    onChange={() => toggleSelect(t.id)}
                    aria-label={`Select transaction from ${t.date}: ${t.description}`}
                    className="rounded"
                  />
                </td>
                <td className="px-4 py-2 text-sm text-slate-700">{t.date}</td>
                <td className="px-4 py-2 text-sm text-slate-800 max-w-xs truncate" title={t.description}>{t.description}</td>
                <td className={`px-4 py-2 text-sm text-right ${Number(t.amount) < 0 ? "text-red-600" : "text-green-600"}`}>
                  {Number(t.amount).toFixed(2)}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={t.categoryId}
                    onChange={(e) => handleCategoryChange(t, e.target.value)}
                    className="text-sm border border-slate-300 rounded px-2 py-1"
                  >
                    {categoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={t.userId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      handleOwnerChange(t, v || null);
                    }}
                    className="text-sm border border-slate-300 rounded px-2 py-1"
                  >
                    <option value="">Shared (income split)</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nickname}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  {isOwnAccount(t.categoryId) && (
                    <button
                      onClick={() => setExpandedTransferId(expandedTransferId === t.id ? null : t.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-200 text-slate-700 hover:bg-slate-300"
                    >
                      🔄 Own Account
                      {!t.linkedTransactionId && <span className="text-amber-600">(unlinked)</span>}
                    </button>
                  )}
                  {isHouseholdMember(t.categoryId) && t.transferCounterpartyUserId && (
                    <button
                      onClick={() => setExpandedTransferId(expandedTransferId === t.id ? null : t.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-white"
                      style={{
                        backgroundColor: users.find((u) => u.id === t.transferCounterpartyUserId)?.color ?? "#6366f1",
                      }}
                    >
                      👤 {users.find((u) => u.id === t.transferCounterpartyUserId)?.nickname ?? "?"}
                    </button>
                  )}
                  {isThirdParty(t.categoryId) && (
                    <button
                      onClick={() => setExpandedTransferId(expandedTransferId === t.id ? null : t.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 hover:bg-blue-200"
                    >
                      🌐 Third Party
                      {t.transferCounterpartyUserId && (
                        <span className="max-w-[80px] truncate" title={users.find((u) => u.id === t.transferCounterpartyUserId)?.nickname}>
                          {users.find((u) => u.id === t.transferCounterpartyUserId)?.nickname}
                        </span>
                      )}
                    </button>
                  )}
                </td>
              </tr>
              {expandedTransferId === t.id && (isOwnAccount(t.categoryId) || isHouseholdMember(t.categoryId) || isThirdParty(t.categoryId)) && (
                <tr>
                  <td colSpan={7} className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <TransferDetailPanel
                      transaction={t}
                      users={users}
                      onUpdate={(data) => update.mutate({ id: t.id, data })}
                      onClose={() => setExpandedTransferId(null)}
                    />
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
  );

  if (isLoading) return <p className="text-slate-600">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Review Transactions</h1>
      <p className="text-slate-600 mb-4">
        Compare merchant totals or review individual transactions. Select rows to bulk edit.
      </p>

      <div className="flex gap-2 mb-4">
        {(["all", "unreviewed", "transfers"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilterTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filterTab === tab
                ? "bg-slate-700 text-white"
                : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {tab === "all" ? "All" : tab === "unreviewed" ? "Unreviewed" : "Transfers"}
          </button>
        ))}
      </div>

      <div
        className="mb-4 p-3 bg-white rounded-lg border border-slate-200"
        onKeyDown={(e) => e.key === "Enter" && applyFilters()}
      >
        <p className="text-xs font-medium text-slate-500 uppercase mb-2">Filters</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">Description</label>
            <input
              type="text"
              placeholder="Search..."
              value={filterInputs.description}
              onChange={(e) => setFilterInputs((f) => ({ ...f, description: e.target.value }))}
              className="text-sm border border-slate-300 rounded px-2 py-1 w-40"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">From date</label>
            <input
              type="date"
              value={filterInputs.from}
              onChange={(e) => setFilterInputs((f) => ({ ...f, from: e.target.value }))}
              className="text-sm border border-slate-300 rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">To date</label>
            <input
              type="date"
              value={filterInputs.to}
              onChange={(e) => setFilterInputs((f) => ({ ...f, to: e.target.value }))}
              className="text-sm border border-slate-300 rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">Category</label>
            <select
              value={filterInputs.category}
              onChange={(e) => setFilterInputs((f) => ({ ...f, category: e.target.value }))}
              className="text-sm border border-slate-300 rounded px-2 py-1"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">User</label>
            <select
              value={filterInputs.userId}
              onChange={(e) => setFilterInputs((f) => ({ ...f, userId: e.target.value }))}
              className="text-sm border border-slate-300 rounded px-2 py-1"
            >
              <option value="">All</option>
              <option value="__shared__">Shared</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nickname}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">Amount min</label>
            <input
              type="number"
              step="0.01"
              placeholder="Min"
              value={filterInputs.amountMin}
              onChange={(e) => setFilterInputs((f) => ({ ...f, amountMin: e.target.value }))}
              className="text-sm border border-slate-300 rounded px-2 py-1 w-24"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">Amount max</label>
            <input
              type="number"
              step="0.01"
              placeholder="Max"
              value={filterInputs.amountMax}
              onChange={(e) => setFilterInputs((f) => ({ ...f, amountMax: e.target.value }))}
              className="text-sm border border-slate-300 rounded px-2 py-1 w-24"
            />
          </div>
          <button
            onClick={applyFilters}
            className="px-3 py-1.5 text-sm bg-slate-700 text-white rounded hover:bg-slate-600"
          >
            Search
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-slate-600 hover:text-slate-800 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Review view">
            {(["merchants", "transactions"] as const).map((option) => (
              <button type="button" key={option} onClick={() => setView(option)} aria-pressed={view === option}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === option ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-white"}`}>
                {option === "merchants" ? "Merchants" : "Transactions"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Sort by
            {view === "merchants" ? (
              <select value={merchantSort} onChange={(event) => setMerchantSort(event.target.value as MerchantSort)} className="max-w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700">
                <option value="out-desc">Money out: highest first</option>
                <option value="out-asc">Money out: lowest first</option>
                <option value="in-desc">Money in: highest first</option>
                <option value="count-desc">Most transactions</option>
                <option value="merchant">Merchant A–Z</option>
                <option value="date-desc">Latest activity</option>
              </select>
            ) : (
              <select value={transactionSort} onChange={(event) => setTransactionSort(event.target.value as TransactionSort)} className="max-w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700">
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="amount-desc">Amount size: largest first</option>
                <option value="amount-asc">Amount size: smallest first</option>
                <option value="merchant">Merchant A–Z</option>
              </select>
            )}
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-sm text-slate-600" aria-live="polite">
            {transactions.length.toLocaleString()} transaction{transactions.length === 1 ? "" : "s"} across {merchantGroups.length.toLocaleString()} merchant{merchantGroups.length === 1 ? "" : "s"}
          </p>
          {transactions.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2 text-slate-600">
                <input type="checkbox" checked={allSelection.checked}
                  ref={(element) => { if (element) element.indeterminate = allSelection.indeterminate; }}
                  onChange={() => toggleSelectRows(transactions)}
                  aria-label="Select all transactions in the current view" className="rounded" />
                Select all
              </label>
              {view === "merchants" && (
                <button type="button" onClick={() => setExpandedMerchants(allMerchantsExpanded ? new Set() : new Set(merchantGroups.map((group) => group.key)))} className="font-medium text-slate-700 underline underline-offset-2">
                  {allMerchantsExpanded ? "Collapse all" : "Expand all"}
                </button>
              )}
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {view === "merchants"
            ? "Totals and group edits use the current filters. Expand a merchant to review each transaction."
            : "Amount sorting compares the size of both payments and credits. Click Date or Amount to change the order."}
        </p>
      </div>

      {(update.isError || bulkUpdate.isError || merchantUpdate.isError || bulkDelete.isError) && (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(update.error ?? bulkUpdate.error ?? merchantUpdate.error ?? bulkDelete.error)?.message ?? "Unable to update transactions. Please try again."}
        </p>
      )}

      {activeSelected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 p-3 bg-slate-100 rounded-lg border border-slate-200">
          <span className="text-sm font-medium text-slate-700">{activeSelected.size} selected</span>
          <select
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            className="text-sm border border-slate-300 rounded px-2 py-1"
          >
            <option value="">Set category...</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={bulkOwner}
            onChange={(e) => setBulkOwner(e.target.value)}
            className="text-sm border border-slate-300 rounded px-2 py-1"
          >
            <option value="">Set user...</option>
            <option value="">Shared (income split)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nickname}
              </option>
            ))}
          </select>
          <button
            onClick={handleBulkApply}
            disabled={!bulkCategory && !bulkOwner}
            className="px-3 py-1 text-sm bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-1 text-sm border border-red-300 text-red-700 rounded hover:bg-red-50"
          >
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1 text-sm border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
          >
            Clear selection
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-4">
            <p className="text-slate-800 font-medium mb-2">Delete transactions?</p>
            <p className="text-slate-600 text-sm mb-4">
              This will permanently delete {activeSelected.size} transaction{activeSelected.size !== 1 ? "s" : ""}. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkDelete.mutate()}
                disabled={bulkDelete.isPending}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDelete.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === "transactions" ? renderTransactionTable(sortedTransactions) : (
        <div className="space-y-3">
          {merchantGroups.map((group) => (
            <MerchantReviewGroup
              key={group.key}
              group={group}
              categories={categoryOptions}
              selected={activeSelected}
              expanded={expandedMerchants.has(group.key)}
              isUpdating={merchantUpdate.isPending || bulkUpdate.isPending}
              onToggleSelect={() => toggleSelectRows(group.transactions)}
              onToggleExpand={() => toggleMerchant(group.key)}
              onCategoryChange={(categoryId) => merchantUpdate.mutate({
                ids: group.transactions.map((transaction) => transaction.id),
                categoryId,
              })}
            >
              {expandedMerchants.has(group.key) && renderTransactionTable(sortTransactions(group.transactions, transactionSort))}
            </MerchantReviewGroup>
          ))}
        </div>
      )}

      {transactions.length === 0 && (
        <p className="mt-6 text-slate-500 text-center">No transactions match the current view.</p>
      )}
    </div>
  );
}
