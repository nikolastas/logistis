import { apiClient } from "./client";
import type { FinanceTransaction } from "../lib/financeLedger";

/** The existing transaction endpoint also returns unassigned imports. Keep these views household-only. */
export async function getFinanceTransactions(householdId: string): Promise<FinanceTransaction[]> {
  const rows = await apiClient.get<FinanceTransaction[]>("/api/transactions?" + new URLSearchParams({ householdId }));
  return rows.filter((row) => row.householdId === householdId);
}
