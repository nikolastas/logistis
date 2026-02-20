export interface PerkCard {
  name: string;
  monthlyValue: number;
  categoryId: string; // category from categories.json — what this perk is spent on (e.g. food, transport)
}

export interface Income {
  id: string;
  userId: string;
  householdId: string;
  netMonthlySalary: number;
  grossMonthlySalary: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  perkCards?: PerkCard[] | null;
}
