import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { User } from "./User";

@Entity("households")
export class Household {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  /** Custom default split: { [userId]: proportion } summing to 1. If null, falls back to income-based. */
  @Column({ type: "jsonb", nullable: true })
  defaultSplit!: Record<string, number> | null;

  @OneToMany(() => User, (u) => u.household)
  users!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
