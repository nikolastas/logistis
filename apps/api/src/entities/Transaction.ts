import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Category } from "./Category";

@Entity("transactions")
export class Transaction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("date")
  date!: string;

  @Column("text")
  description!: string;

  @Column("decimal", { precision: 12, scale: 2 })
  amount!: number;

  @Column("varchar", { length: 50 })
  categoryId!: string;

  @ManyToOne(() => Category, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "categoryId" })
  category?: Category | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  owner?: "user1" | "user2" | "shared" | null;

  @Column("jsonb", { nullable: true, default: null })
  splitRatio!: Record<string, number> | null;

  @Column({ type: "varchar", length: 50, default: "unknown" })
  bankSource!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  bankReference?: string | null;

  @Column("jsonb", { nullable: true })
  rawData?: Record<string, unknown>;

  @Column("uuid", { nullable: true })
  householdId?: string | null;

  @Column("uuid", { nullable: true })
  ownerId?: string | null;

  @Column("boolean", { default: false })
  orphaned!: boolean;

  @Column({ type: "varchar", length: 20, nullable: true })
  transferType!: "none" | "own_account" | "household_member" | "third_party" | null;

  @Column("uuid", { nullable: true })
  linkedTransactionId?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  transferCounterparty?: string | null;

  @Column("uuid", { nullable: true })
  transferCounterpartyUserId?: string | null;

  @Column("boolean", { default: false })
  isExcludedFromAnalytics!: boolean;

  @Column("boolean", { default: false })
  countAsExpense!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
