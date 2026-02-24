import { apiClient } from "./client";
import type {
  BudgetPlan,
  BudgetItem,
  BudgetSummary,
  BudgetComparison,
} from "@couple-finance/shared";

export interface BudgetPlanListItem extends BudgetPlan {
  itemCount: number;
  totalPlanned: number;
}

export async function listBudgetPlans(householdId: string): Promise<BudgetPlanListItem[]> {
  return apiClient.get(`/api/households/${householdId}/budgets`);
}

export async function getBudgetPlan(householdId: string, budgetPlanId: string): Promise<BudgetPlan> {
  return apiClient.get(`/api/households/${householdId}/budgets/${budgetPlanId}`);
}

export async function createBudgetPlan(
  householdId: string,
  data: { month: string; savingsTarget?: number | null; notes?: string | null }
): Promise<BudgetPlan> {
  return apiClient.post(`/api/households/${householdId}/budgets`, data);
}

export async function updateBudgetPlan(
  householdId: string,
  budgetPlanId: string,
  data: Partial<{
    month: string;
    savingsTarget: number | null;
    status: "draft" | "active" | "closed";
    notes: string | null;
  }>
): Promise<BudgetPlan> {
  return apiClient.put(`/api/households/${householdId}/budgets/${budgetPlanId}`, data);
}

export async function deleteBudgetPlan(householdId: string, budgetPlanId: string): Promise<void> {
  return apiClient.delete(`/api/households/${householdId}/budgets/${budgetPlanId}`);
}

export async function createBudgetItem(
  householdId: string,
  budgetPlanId: string,
  data: { userId?: string | null; name: string; amount: number; type: "income" | "expense"; categoryId: string }
): Promise<BudgetItem> {
  return apiClient.post(`/api/households/${householdId}/budgets/${budgetPlanId}/items`, data);
}

export async function updateBudgetItem(
  householdId: string,
  budgetPlanId: string,
  itemId: string,
  data: Partial<{ userId: string | null; name: string; amount: number; type: "income" | "expense"; categoryId: string }>
): Promise<BudgetItem> {
  return apiClient.put(
    `/api/households/${householdId}/budgets/${budgetPlanId}/items/${itemId}`,
    data
  );
}

export async function deleteBudgetItem(
  householdId: string,
  budgetPlanId: string,
  itemId: string
): Promise<void> {
  return apiClient.delete(
    `/api/households/${householdId}/budgets/${budgetPlanId}/items/${itemId}`
  );
}

export async function getBudgetSummary(
  householdId: string,
  budgetPlanId: string
): Promise<BudgetSummary> {
  return apiClient.get(`/api/households/${householdId}/budgets/${budgetPlanId}/summary`);
}

export async function getBudgetComparison(
  householdId: string,
  budgetPlanId: string
): Promise<BudgetComparison> {
  return apiClient.get(`/api/households/${householdId}/budgets/${budgetPlanId}/comparison`);
}
