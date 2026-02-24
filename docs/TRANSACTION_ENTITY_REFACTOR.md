# Transaction Entity Refactor Proposal

## Project Goal (from README)

> Help couples understand spending patterns, track shared expenses, and maximize savings. Tag transactions as Personal (User 1 / User 2) or Shared (configurable split).

---

## Current Transaction Entity (Problems)

| Column | Issue |
|--------|-------|
| `owner` | Legacy enum (`user1`/`user2`/`shared`) — redundant with `ownerId` |
| `ownerId` | Rename to `userId` for clarity (nullable = shared) |
| `splitRatio` | Stored per-transaction; duplicates household-level `User.expenseShare` |
| `transferType` | Redundant — category already encodes this (`transfer/own-account`, etc.) |
| `transferCounterparty` | Raw name — redundant when we have `transferCounterpartyUserId` |
| `categoryId` | Already includes transfer type via `transfer/*` categories |

---

## Proposed Transaction Entity

```ts
@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('date')
  date!: string;

  @Column('text')
  description!: string;

  /** Positive = user receives; negative = user pays */
  @Column('decimal', { precision: 12, scale: 2 })
  amount!: number;

  @Column('varchar', { length: 50 })
  categoryId!: string;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category?: Category | null;

  /**
   * User who owns the transaction. Null = shared (split by household expenseShare).
   * Non-null = personal (100% attributed to this user).
   */
  @Column('uuid', { nullable: true })
  userId?: string | null;

  @Column({ type: 'varchar', length: 50, default: 'unknown' })
  bankSource!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankReference?: string | null;

  @Column('jsonb', { nullable: true })
  rawData?: Record<string, unknown>;

  @Column('uuid', { nullable: true })
  householdId?: string | null;

  @Column('boolean', { default: false })
  orphaned!: boolean;

  /**
   * For transfers: the other user (counterparty). Populated when category
   * is transfer/to-household-member, transfer/from-household-member,
   * transfer/to-external-member, or transfer/from-external-member.
   * Null for own-account transfers (category = transfer/own-account).
   */
  @Column('uuid', { nullable: true })
  transferCounterpartyUserId?: string | null;

  /** Link to matching leg for own-account transfers (transfer/own-account) */
  @Column('uuid', { nullable: true })
  linkedTransactionId?: string | null;

  /** User override: exclude from spending analytics (e.g. reimbursement) */
  @Column('boolean', { default: false })
  isExcludedFromAnalytics!: boolean;

  /** For third-party transfers: user marked as expense (include in analytics) */
  @Column('boolean', { default: false })
  countAsExpense!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
```

### Removed Columns

| Column | Replacement |
|--------|-------------|
| `owner` | Remove — use `userId` only |
| `ownerId` | Rename to `userId`. Null = shared, non-null = personal |
| `splitRatio` | Derive from `householdId` + `User.expenseShare` via `getSharedExpenseSplit()` |
| `transferType` | Derive from `categoryId` (e.g. `categoryId.startsWith('transfer/')`) |
| `transferCounterparty` | Use `transferCounterpartyUserId` → load User for display name |

---

## Derivation Rules

### 1. Split for shared transactions

When `userId` is null and `householdId` is set:

```ts
const split = await getSharedExpenseSplit(householdId);
// split = { [userId]: proportion } from User.expenseShare or income-based
```

No per-transaction storage needed.

### 2. Transfer type from category

| categoryId | Meaning |
|------------|---------|
| `transfer/own-account` | Own-account transfer |
| `transfer/to-household-member` | To household user |
| `transfer/from-household-member` | From household user |
| `transfer/to-external-member` | To user in another household |
| `transfer/from-external-member` | From user in another household |
| `transfer/to-third-party` | To external (no user) |
| `transfer/from-third-party` | From external (no user) |

```ts
function getTransferType(categoryId: string): TransferType | null {
  if (!categoryId?.startsWith('transfer/')) return null;
  const suffix = categoryId.replace('transfer/', '');
  const map: Record<string, TransferType> = {
    'own-account': 'own_account',
    'to-household-member': 'household_member',
    'from-household-member': 'household_member',
    'to-external-member': 'third_party',
    'from-external-member': 'third_party',
    'to-third-party': 'third_party',
    'from-third-party': 'third_party',
  };
  return map[suffix] ?? null;
}
```

### 3. Excluded from analytics

```ts
function isExcluded(t: Transaction): boolean {
  if (t.isExcludedFromAnalytics) return true;
  if (t.categoryId?.startsWith('transfer/')) return true;
  return false;
}
```

Exception: `transfer/to-third-party` and `transfer/from-third-party` with `countAsExpense = true` are included.

---

## Migration Strategy

1. **Phase 1**: Add new columns if needed (none — we're removing).
2. **Phase 2**: Migrate data:
   - Rename `ownerId` → `userId`; drop `owner` (map `user1`/`user2` to actual userIds if needed, or leave as-is).
   - `splitRatio`: no migration — delete column; all shared txns will use `getSharedExpenseSplit()` at read time.
   - `transferType`: drop — derive from categoryId.
   - `transferCounterparty`: drop — use `User.nickname` or `User.nameAliases[0]` from `transferCounterpartyUserId`.
3. **Phase 3**: Update all consumers (statements, transactions routes, insights, Review UI).
4. **Phase 4**: Drop columns.

---

## Files to Update

| Area | Changes |
|------|---------|
| `Transaction.ts` | Rename ownerId→userId; remove owner, splitRatio, transferType, transferCounterparty |
| `statements.ts` | Set userId only; no splitRatio; categoryId for transfer type |
| `transactions.ts` | Update filters, bulk update (userId only, no splitRatio) |
| `insightsService.ts` | Derive split from getSharedExpenseSplit(householdId) when userId null |
| `transferDetectionService.ts` | Set categoryId + transferCounterpartyUserId; no transferType |
| `Review.tsx` | User dropdown; derive split display from household |
| `Upload.tsx` | userId only |
| Shared types | Update Transaction interface |

---

## Summary

- **userId** (nullable): null = shared, non-null = personal. Renamed from ownerId.
- **splitRatio**: removed; use `getSharedExpenseSplit(householdId)` when ownerId is null.
- **transferType**: removed; infer from `categoryId`.
- **transferCounterparty**: removed; use `transferCounterpartyUserId` + User for display.
- **transferCounterpartyUserId**: kept — identifies the other user in a transfer.
- **linkedTransactionId**: kept — for own-account transfer leg matching.
