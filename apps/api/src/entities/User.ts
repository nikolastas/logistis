import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { Household } from "./Household";
import { Income } from "./Income";
import { PerkCard } from "./PerkCard";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid")
  householdId!: string;

  @ManyToOne(() => Household, (h) => h.users, { onDelete: "CASCADE" })
  @JoinColumn({ name: "householdId" })
  household!: Household;

  @Column({ type: "varchar", length: 100 })
  nickname!: string;

  /** Full name aliases for transfer counterparty matching (e.g. "NIKOS NTASIOPOULOS", "Νίκος Ντασιόπουλος") */
  @Column({ type: "jsonb", default: () => "'[]'" })
  nameAliases!: string[];

  @Column({ type: "varchar", length: 20, default: "#6366f1" })
  color!: string;

  /** User's share of shared expenses (0–1). If null, falls back to income-based split. */
  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  expenseShare!: number | null;

  @OneToMany(() => Income, (i) => i.user)
  incomes!: Income[];

  @OneToMany(() => PerkCard, (p) => p.user)
  perkCards!: PerkCard[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
