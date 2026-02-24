import { apiClient } from "./client";
import type { Household, User, Income, PerkCard } from "@couple-finance/shared";

const STORAGE_KEY = "householdId";

export function getStoredHouseholdId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setStoredHouseholdId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}

export function clearStoredHouseholdId(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export interface HouseholdListItem {
  id: string;
  name: string;
  createdAt: string;
  userCount: number;
}

export interface HouseholdIncomeSummary {
  total: number;
  breakdown: Array<{
    userId: string;
    nickname: string;
    netMonthlySalary: number;
    perkCardsTotal?: number;
  }>;
}

export async function listHouseholds(): Promise<HouseholdListItem[]> {
  return apiClient.get("/api/households");
}

export async function getHousehold(id: string): Promise<Household & { users: User[] }> {
  return apiClient.get(`/api/households/${id}`);
}

export async function createHousehold(data: { name: string; defaultSavingsTarget?: number | null }): Promise<Household> {
  return apiClient.post("/api/households", data);
}

export async function updateHousehold(
  id: string,
  data: { name?: string; defaultSavingsTarget?: number | null }
): Promise<Household> {
  return apiClient.put(`/api/households/${id}`, data);
}

export async function deleteHousehold(id: string): Promise<void> {
  return apiClient.delete(`/api/households/${id}`);
}

export async function getSharedExpenseSplit(householdId: string): Promise<Record<string, number>> {
  return apiClient.get(`/api/households/${householdId}/shared-expense-split`);
}

export interface TransfersInsight {
  ownAccountTransfers: { count: number; totalMoved: number; unlinked: number };
  householdMemberTransfers: Array<{
    fromUserId: string;
    toUserId: string;
    count: number;
    totalAmount: number;
  }>;
  thirdPartyTransfers: {
    outgoing: { count: number; total: number };
    incoming: { count: number; total: number };
  };
}

export async function getTransfersInsight(
  householdId: string,
  month?: string
): Promise<TransfersInsight> {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return apiClient.get(`/api/households/${householdId}/insights/transfers${qs}`);
}

export async function getHouseholdIncomeSummary(
  householdId: string,
  month?: string
): Promise<HouseholdIncomeSummary> {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  return apiClient.get(`/api/households/${householdId}/income-summary${q}`);
}

export async function listUsers(householdId: string): Promise<User[]> {
  return apiClient.get(`/api/households/${householdId}/users`);
}

export async function createUser(
  householdId: string,
  data: { nickname: string; nameAliases: string[]; color?: string }
): Promise<User> {
  return apiClient.post(`/api/households/${householdId}/users`, data);
}

export async function updateUser(
  householdId: string,
  userId: string,
  data: Partial<{ nickname: string; nameAliases: string[]; color: string; expenseShare: number | null }>
): Promise<User> {
  return apiClient.put(`/api/households/${householdId}/users/${userId}`, data);
}

export async function getUserOrphanedCount(
  householdId: string,
  userId: string
): Promise<{ orphanedTransactionCount: number }> {
  return apiClient.get(
    `/api/households/${householdId}/users/${userId}/orphaned-count`
  );
}

export async function deleteUser(
  householdId: string,
  userId: string
): Promise<{ orphanedTransactionCount: number }> {
  return apiClient.deleteWithResponse<{ orphanedTransactionCount: number }>(
    `/api/households/${householdId}/users/${userId}`
  );
}

export async function listIncome(householdId: string, userId: string): Promise<Income[]> {
  return apiClient.get(`/api/households/${householdId}/users/${userId}/income`);
}

export async function createIncome(
  householdId: string,
  userId: string,
  data: {
    netMonthlySalary: number;
    effectiveFrom: string;
    notes?: string;
    perkCards?: PerkCard[];
  }
): Promise<Income> {
  return apiClient.post(`/api/households/${householdId}/users/${userId}/income`, data);
}

export async function updateIncome(
  householdId: string,
  userId: string,
  incomeId: string,
  data: Partial<{
    netMonthlySalary: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    notes: string | null;
    perkCards: PerkCard[] | null;
  }>
): Promise<Income> {
  return apiClient.put(
    `/api/households/${householdId}/users/${userId}/income/${incomeId}`,
    data
  );
}

export async function deleteIncome(
  householdId: string,
  userId: string,
  incomeId: string
): Promise<void> {
  return apiClient.delete(`/api/households/${householdId}/users/${userId}/income/${incomeId}`);
}

export async function listPerkCards(
  householdId: string,
  userId: string
): Promise<PerkCard[]> {
  return apiClient.get(`/api/households/${householdId}/users/${userId}/perk-cards`);
}

export async function createPerkCard(
  householdId: string,
  userId: string,
  data: { name: string; monthlyValue: number; categoryIds?: string[] }
): Promise<PerkCard> {
  return apiClient.post(`/api/households/${householdId}/users/${userId}/perk-cards`, data);
}

export async function updatePerkCard(
  householdId: string,
  userId: string,
  perkCardId: string,
  data: Partial<{ name: string; monthlyValue: number; categoryIds: string[] }>
): Promise<PerkCard> {
  return apiClient.put(
    `/api/households/${householdId}/users/${userId}/perk-cards/${perkCardId}`,
    data
  );
}

export async function deletePerkCard(
  householdId: string,
  userId: string,
  perkCardId: string
): Promise<void> {
  return apiClient.delete(
    `/api/households/${householdId}/users/${userId}/perk-cards/${perkCardId}`
  );
}
