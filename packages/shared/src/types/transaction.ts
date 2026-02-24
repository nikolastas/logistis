export interface Transaction {
  id: string;
  date: string;
  description: string;
  /** Positive = user receives; negative = user pays */
  amount: number;
  categoryId: string;
  /** Null = shared (split by household expenseShare) */
  userId: string | null;
  bankSource: string;
  rawData?: Record<string, unknown>;
  createdAt: string;
  /** If own-account transfer, link to matching leg */
  linkedTransactionId?: string | null;
  /** FK to User for transfer counterparty */
  transferCounterpartyUserId?: string | null;
  /** Excluded from spending/savings analytics */
  isExcludedFromAnalytics?: boolean;
  /** For third_party: user explicitly marked as expense */
  countAsExpense?: boolean;
}

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  bankReference?: string;
  rawData?: Record<string, unknown>;
  /** Parser hint: Revolut Type=TRANSFER → own_account candidate */
  transferHint?: "own_account";
}
