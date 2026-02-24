import { apiClient } from "./client";

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  categoryId: string;
  userId: string | null;
  bankSource: string;
  rawData?: Record<string, unknown>;
  createdAt: string;
  linkedTransactionId?: string | null;
  transferCounterpartyUserId?: string | null;
  isExcludedFromAnalytics?: boolean;
  countAsExpense?: boolean;
}

export interface TransactionFilters {
  from?: string;
  to?: string;
  category?: string;
  userId?: string;
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
  if (params?.userId) search.set("userId", params.userId);
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
    userId?: string | null;
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
    userId?: string | null;
    isExcludedFromAnalytics?: boolean;
    countAsExpense?: boolean;
  }
): Promise<{ updated: number }> {
  return apiClient.patch("/api/transactions/bulk", { ids, ...data });
}

export async function bulkDeleteTransactions(ids: string[]): Promise<{ deleted: number }> {
  return apiClient.deleteWithResponse<{ deleted: number }>("/api/transactions/bulk", { ids });
}
