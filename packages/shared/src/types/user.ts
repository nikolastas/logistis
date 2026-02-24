export interface User {
  id: string;
  householdId: string;
  nickname: string;
  /** Full name aliases for transfer counterparty matching (e.g. "NIKOS NTASIOPOULOS", "Νίκος Ντασιόπουλος") */
  nameAliases: string[];
  color: string;
  /** User's share of shared expenses (0–1). If null, falls back to income-based split. */
  expenseShare?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
