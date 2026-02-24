import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from "typeorm";
import { Income } from "./Income";
import { PerkCard } from "./PerkCard";

@Entity("income_perk_cards")
@Unique(["incomeId", "perkCardId"])
export class IncomePerkCard {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid")
  incomeId!: string;

  @ManyToOne(() => Income, (i) => i.incomePerkCards, { onDelete: "CASCADE" })
  @JoinColumn({ name: "incomeId" })
  income!: Income;

  @Column("uuid")
  perkCardId!: string;

  @ManyToOne(() => PerkCard, { onDelete: "CASCADE" })
  @JoinColumn({ name: "perkCardId" })
  perkCard!: PerkCard;

  /** Override PerkCard.monthlyValue for this income. If null, use PerkCard.monthlyValue. */
  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  monthlyValue!: number | null;
}
