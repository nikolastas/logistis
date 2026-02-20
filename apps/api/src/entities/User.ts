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

  @Column({ type: "varchar", length: 255 })
  legalNameEl!: string;

  @Column({ type: "varchar", length: 255 })
  legalNameEn!: string;

  @Column({ type: "varchar", length: 20, default: "#6366f1" })
  color!: string;

  @OneToMany(() => Income, (i) => i.user)
  incomes!: Income[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
