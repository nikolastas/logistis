import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Household } from './Household';
import { BudgetItem } from './BudgetItem';

@Entity('budget_plans')
export class BudgetPlan {
  id!: string;

  @Column('uuid')
  householdId!: string;

  @ManyToOne(() => Household, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'householdId' })
  household!: Household;

  /** YYYY-MM */
  @Column({ type: 'varchar', length: 7 })
  month!: string;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  savingsTarget!: number | null;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: 'draft' | 'active' | 'closed';

  @Column('text', { nullable: true })
  notes!: string | null;

  @OneToMany(() => BudgetItem, (item) => item.budgetPlan, { cascade: true })
  items!: BudgetItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
