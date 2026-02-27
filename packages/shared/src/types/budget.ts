export interface BudgetPlan {
  id: string;
  householdId: string;
  month: string;
  savingsTarget: number | null;
  status: "draft" | "active" | "closed";
  notes: string | null;
  items?: BudgetItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetItem {
  id: string;
  budgetPlanId: string;
  userId: string | null;
  name: string;
  amount: number;
  type: "income" | "expense";
  categoryId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetSummary {
  household: {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    savingsTarget: number;
  };
  users: Array<{
    userId: string;
    nickname: string;
    income: number;
    personalExpenses: number;
    sharedExpenseShare: number;
    pct: number;
    savingsTarget: number;
    freeMoney: number;
  }>;
  shared: { totalExpenses: number };
}

export interface BudgetComparison {
  items: Array<{
    budgetItemId: string;
    name: string;
    categoryId: string;
    userId: string | null;
    planned: number;
    actual: number;
    difference: number;
  }>;
  totalPlanned: number;
  totalActual: number;
  totalDifference: number;
  sharedByUser: Array<{
    userId: string;
    nickname: string;
    plannedShared: number;
    actualShared: number;
    difference: number;
  }>;
}
