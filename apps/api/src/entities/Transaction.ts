import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Category } from './Category';
import { User } from './User';

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

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user?: User | null;

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
