/** Split ratio: keys are userId, values are 0–1, should sum to 1 */
export type SplitRatio = Record<string, number>;

export type TransferType = "none" | "own_account" | "household_member" | "third_party";

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  categoryId: string;
  ownerId: string | null;
  splitRatio: SplitRatio;
  bankSource: string;
  rawData?: Record<string, unknown>;
  createdAt: string;
  /** Transfer classification */
  transferType?: TransferType | null;
  /** If own-account transfer, link to matching leg */
  linkedTransactionId?: string | null;
  /** Raw counterparty name from description */
  transferCounterparty?: string | null;
  /** FK to User when transferType = household_member */
  transferCounterpartyUserId?: string | null;
  /** Excluded from spending/savings analytics (own_account, or user-marked) */
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
