import { apiClient } from "./client";

export type TransferType = "none" | "own_account" | "household_member" | "third_party";

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  categoryId: string;
  ownerId: string | null;
  splitRatio: Record<string, number> | null;
  bankSource: string;
  rawData?: Record<string, unknown>;
  createdAt: string;
  transferType?: TransferType | null;
  linkedTransactionId?: string | null;
  transferCounterparty?: string | null;
  transferCounterpartyUserId?: string | null;
  isExcludedFromAnalytics?: boolean;
  countAsExpense?: boolean;
}

export interface TransactionFilters {
  from?: string;
  to?: string;
  category?: string;
  owner?: string;
  ownerId?: string;
  householdId?: string;
  description?: string;
  amountMin?: number | string;
  amountMax?: number | string;
  transferType?: "transfers";
}

export async function listTransactions(params?: TransactionFilters): Promise<Transaction[]> {
  const base = import.meta.env.VITE_API_URL || "";
  const path = "/api/transactions";
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.category) search.set("category", params.category);
  if (params?.owner) search.set("owner", params.owner);
  if (params?.ownerId) search.set("ownerId", params.ownerId);
  if (params?.householdId) search.set("householdId", params.householdId);
  if (params?.description) search.set("description", params.description);
  if (params?.amountMin != null && params.amountMin !== "") search.set("amountMin", String(params.amountMin));
  if (params?.amountMax != null && params.amountMax !== "") search.set("amountMax", String(params.amountMax));
  if (params?.transferType) search.set("transferType", params.transferType);
  const qs = search.toString();
  const url = base ? `${base}${path}${qs ? `?${qs}` : ""}` : `${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function updateTransaction(
  id: string,
  data: {
    categoryId?: string;
    ownerId?: string | null;
    splitRatio?: Record<string, number>;
    transferType?: TransferType | null;
    transferCounterparty?: string | null;
    transferCounterpartyUserId?: string | null;
    isExcludedFromAnalytics?: boolean;
    countAsExpense?: boolean;
  }
): Promise<Transaction> {
  return apiClient.patch(`/api/transactions/${id}`, data);
}

export async function bulkUpdateTransactions(
  ids: string[],
  data: {
    categoryId?: string;
    ownerId?: string | null;
    splitRatio?: Record<string, number>;
    transferType?: TransferType | null;
    isExcludedFromAnalytics?: boolean;
    countAsExpense?: boolean;
  }
): Promise<{ updated: number }> {
  return apiClient.patch("/api/transactions/bulk", { ids, ...data });
}
