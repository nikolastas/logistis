import { apiClient } from "./client";

export interface SpendingByCategory {
  categoryId: string;
  categoryName?: string;
  total: number;
  count: number;
}

export interface SpendingByOwner {
  owner: string;
  userId?: string | null;
  total: number;
  count: number;
}

export interface SpendingByMonth {
  month: string;
  total: number;
  count: number;
}

export interface SpendingInsights {
  byCategory: SpendingByCategory[];
  byOwner: SpendingByOwner[];
  byMonth: SpendingByMonth[];
  totalTransactions?: number;
  expenseCount?: number;
}

export interface Category {
  id: string;
  name: string;
  keywords?: string[];
}

/** Categories as select options */
export function flattenCategoryOptions(categories: Category[]): Array<{ id: string; name: string }> {
  return categories.map((c) => ({ id: c.id, name: c.name }));
}

export async function getSpendingInsights(params?: {
  from?: string;
  to?: string;
  householdId?: string;
  userId?: string | null;
}): Promise<SpendingInsights> {
  const base = import.meta.env.VITE_API_URL || "";
  const path = "/api/insights/spending";
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.householdId) search.set("householdId", params.householdId);
  if (params?.userId != null && params.userId !== "") search.set("userId", params.userId);
  const qs = search.toString();
  const url = base ? `${base}${path}${qs ? `?${qs}` : ""}` : `${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function getCategories(): Promise<Category[]> {
  return apiClient.get("/api/insights/categories");
}

export interface SpendingByMonthCategory {
  month: string;
  categoryId: string;
  categoryName?: string;
  total: number;
}

export async function getSpendingByMonthCategory(params?: {
  year?: number;
  householdId?: string;
  userId?: string | null;
}): Promise<SpendingByMonthCategory[]> {
  const base = import.meta.env.VITE_API_URL || "";
  const search = new URLSearchParams();
  if (params?.year != null) search.set("year", String(params.year));
  if (params?.householdId) search.set("householdId", params.householdId);
  if (params?.userId != null && params.userId !== "") search.set("userId", params.userId);
  const qs = search.toString();
  const url = base
    ? `${base}/api/insights/spending-by-month-category${qs ? `?${qs}` : ""}`
    : `/api/insights/spending-by-month-category${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}
