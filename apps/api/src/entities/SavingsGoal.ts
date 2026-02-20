import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("savings_goals")
export class SavingsGoal {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column("decimal", { precision: 12, scale: 2, default: 0 })
  targetAmount!: number;

  @Column("decimal", { precision: 12, scale: 2, default: 0 })
  currentAmount!: number;

  @Column("date")
  targetDate!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
