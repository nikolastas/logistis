import { apiClient } from "./client";

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  createdAt: string;
}

export interface SavingsSuggestion {
  goalId: string;
  monthlyTarget: number;
  monthsRemaining: number;
  remainingAmount: number;
}

export async function listGoals(): Promise<SavingsGoal[]> {
  return apiClient.get("/api/goals");
}

export async function createGoal(data: {
  name: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate: string;
}): Promise<SavingsGoal> {
  return apiClient.post("/api/goals", data);
}

export async function updateGoal(
  id: string,
  data: Partial<{ name: string; targetAmount: number; currentAmount: number; targetDate: string }>
): Promise<SavingsGoal> {
  return apiClient.patch(`/api/goals/${id}`, data);
}

export async function deleteGoal(id: string): Promise<void> {
  return apiClient.delete(`/api/goals/${id}`);
}

export async function getSavingsSuggestion(id: string): Promise<SavingsSuggestion> {
  return apiClient.get(`/api/goals/${id}/savings-suggestion`);
}
