import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { BudgetPlan } from "./BudgetPlan";
import { User } from "./User";
import { Category } from "./Category";

@Entity("budget_items")
export class BudgetItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid")
  budgetPlanId!: string;

  @ManyToOne(() => BudgetPlan, (plan) => plan.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "budgetPlanId" })
  budgetPlan!: BudgetPlan;

  @Column("uuid", { nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "userId" })
  user!: User | null;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column("decimal", { precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: "varchar", length: 20 })
  type!: "income" | "expense";

  @Column({ type: "varchar", length: 50 })
  categoryId!: string;

  @ManyToOne(() => Category, { onDelete: "RESTRICT", nullable: false })
  @JoinColumn({ name: "categoryId" })
  category!: Category;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
