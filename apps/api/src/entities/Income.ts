import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { Household } from "./Household";

@Entity("income")
export class Income {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid")
  userId!: string;

  @ManyToOne(() => User, (u) => u.incomes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column("uuid")
  householdId!: string;

  @ManyToOne(() => Household)
  @JoinColumn({ name: "householdId" })
  household!: Household;

  @Column("decimal", { precision: 10, scale: 2 })
  netMonthlySalary!: number;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  grossMonthlySalary!: number | null;

  @Column("date")
  effectiveFrom!: string;

  @Column("date", { nullable: true })
  effectiveTo!: string | null;

  @Column("text", { nullable: true })
  notes!: string | null;

  @Column("jsonb", { nullable: true })
  perkCards!: Array<{ name: string; monthlyValue: number }> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
