import type { BudgetSummary } from "@couple-finance/shared";

// Accept summaries from both the original API and the deployed reimbursement-aware API.
type BudgetReviewSummary = Omit<BudgetSummary, "users"> & {
  users: Array<BudgetSummary["users"][number] & { sharedAccountContribution?: number }>;
  reimbursements?: Array<{
    fromUserId: string;
    fromNickname: string;
    toUserId: string;
    toNickname: string;
    amount: number;
    details: Array<{ itemName: string }>;
  }>;
};

export type BudgetTransferKind = "shared-expenses" | "shared-savings" | "member";

export interface BudgetTransferInstruction {
  id: string;
  kind: BudgetTransferKind;
  destination: string;
  description: string;
  amount: number;
}

export interface BudgetReviewResult {
  outgoing: BudgetTransferInstruction[];
  incoming: BudgetTransferInstruction[];
  totalToSend: number;
  totalExpectedBack: number;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function positiveAmount(value: number): number {
  return value > 0 ? roundCurrency(value) : 0;
}

function reimbursementDescription(
  details: NonNullable<BudgetReviewSummary["reimbursements"]>[number]["details"]
): string {
  const itemNames = Array.from(new Set(details.map((detail) => detail.itemName)));
  if (itemNames.length === 0) return "Net reimbursement for shared expenses";
  return `For ${itemNames.join(", ")}`;
}

export function buildBudgetReview(
  summary: BudgetReviewSummary,
  userId: string
): BudgetReviewResult {
  const user = summary.users.find((candidate) => candidate.userId === userId);
  if (!user) {
    return { outgoing: [], incoming: [], totalToSend: 0, totalExpectedBack: 0 };
  }

  const outgoing: BudgetTransferInstruction[] = [];
  const sharedAccountContribution = positiveAmount(user.sharedAccountContribution ?? user.sharedExpenseShare);
  const savingsContribution = positiveAmount(user.savingsTarget);

  if (sharedAccountContribution > 0) {
    outgoing.push({
      id: "shared-expenses",
      kind: "shared-expenses",
      destination: "Shared expense account",
      description: "Fund planned household expenses",
      amount: sharedAccountContribution,
    });
  }

  if (savingsContribution > 0) {
    outgoing.push({
      id: "shared-savings",
      kind: "shared-savings",
      destination: "Shared savings account",
      description: "Your share of the savings target",
      amount: savingsContribution,
    });
  }

  const reimbursements = summary.reimbursements ?? [];
  for (const reimbursement of reimbursements) {
    const amount = positiveAmount(reimbursement.amount);
    if (amount === 0) continue;

    if (reimbursement.fromUserId === userId) {
      outgoing.push({
        id: `reimbursement:${reimbursement.fromUserId}:${reimbursement.toUserId}`,
        kind: "member",
        destination: reimbursement.toNickname,
        description: reimbursementDescription(reimbursement.details),
        amount,
      });
    }
  }

  const incoming = reimbursements
    .filter((reimbursement) => reimbursement.toUserId === userId)
    .map((reimbursement) => ({
      id: `incoming:${reimbursement.fromUserId}:${reimbursement.toUserId}`,
      kind: "member" as const,
      destination: reimbursement.fromNickname,
      description: reimbursementDescription(reimbursement.details),
      amount: positiveAmount(reimbursement.amount),
    }))
    .filter((instruction) => instruction.amount > 0);

  return {
    outgoing,
    incoming,
    totalToSend: roundCurrency(
      outgoing.reduce((total, instruction) => total + instruction.amount, 0)
    ),
    totalExpectedBack: roundCurrency(
      incoming.reduce((total, instruction) => total + instruction.amount, 0)
    ),
  };
}
