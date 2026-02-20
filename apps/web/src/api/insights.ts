import { apiClient } from "./client";

export interface SpendingByCategory {
  categoryId: string;
  categoryName?: string;
  total: number;
  count: number;
}

export interface SpendingByOwner {
  owner: string;
  ownerId?: string | null;
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
  subcategories?: Array<{ id: string; name: string }>;
}

/** Flatten categories for select options (includes subcategories) */
export function flattenCategoryOptions(categories: Category[]): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  for (const c of categories) {
    if (c.subcategories?.length) {
      for (const s of c.subcategories) {
        out.push({ id: s.id, name: `${c.name} / ${s.name}` });
      }
    } else {
      out.push({ id: c.id, name: c.name });
    }
  }
  return out;
}

export async function getSpendingInsights(params?: {
  from?: string;
  to?: string;
  householdId?: string;
}): Promise<SpendingInsights> {
  const base = import.meta.env.VITE_API_URL || "";
  const path = "/api/insights/spending";
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.householdId) search.set("householdId", params.householdId);
  const qs = search.toString();
  const url = base ? `${base}${path}${qs ? `?${qs}` : ""}` : `${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function getCategories(): Promise<Category[]> {
  return apiClient.get("/api/insights/categories");
}
