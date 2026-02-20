export interface Household {
  id: string;
  name: string;
  /** Custom default split: { [userId]: proportion } summing to 1. If null, falls back to income-based. */
  defaultSplit?: Record<string, number> | null;
  createdAt: Date;
  updatedAt: Date;
}
