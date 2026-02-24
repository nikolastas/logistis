export interface PerkCard {
  id?: string;
  name: string;
  monthlyValue: number;
  /** Categories this perk can be used on (e.g. food, transport) */
  categoryIds: string[];
}

export interface Income {
  id: string;
  userId: string;
  householdId: string;
  netMonthlySalary: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  perkCards?: PerkCard[] | null;
}
