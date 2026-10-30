import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/lib/budgetReview.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { buildBudgetReview } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));

const summary = {
  household: {
    totalIncome: 4_000,
    totalExpenses: 900,
    balance: 2_600,
    savingsTarget: 500,
  },
  users: [
    {
      userId: "anna",
      nickname: "Anna",
      income: 1_800,
      personalExpenses: 100,
      sharedExpenseShare: 450,
      sharedAccountContribution: 400.1,
      pct: 0.5,
      savingsTarget: 250.2,
      freeMoney: 1_000,
      actualFreeMoney: 1_050,
    },
    {
      userId: "nikos",
      nickname: "Nikos",
      income: 2_200,
      personalExpenses: 150,
      sharedExpenseShare: 450,
      sharedAccountContribution: 400,
      pct: 0.5,
      savingsTarget: 250,
      freeMoney: 1_400,
      actualFreeMoney: 1_350,
    },
  ],
  shared: { totalExpenses: 900 },
  reimbursements: [
    {
      fromUserId: "anna",
      fromNickname: "Anna",
      toUserId: "nikos",
      toNickname: "Nikos",
      amount: 49.7,
      details: [
        {
          budgetItemId: "utilities",
          itemName: "Electricity",
          fromUserId: "anna",
          fromNickname: "Anna",
          toUserId: "nikos",
          toNickname: "Nikos",
          amount: 49.7,
        },
      ],
    },
  ],
};

test("builds a complete outgoing transfer checklist", () => {
  const result = buildBudgetReview(summary, "anna");

  assert.deepEqual(
    result.outgoing.map(({ destination, amount }) => ({ destination, amount })),
    [
      { destination: "Shared expense account", amount: 400.1 },
      { destination: "Shared savings account", amount: 250.2 },
      { destination: "Nikos", amount: 49.7 },
    ]
  );
  assert.equal(result.totalToSend, 700);
  assert.equal(result.totalExpectedBack, 0);
});

test("shows incoming reimbursements without adding them to outgoing total", () => {
  const result = buildBudgetReview(summary, "nikos");

  assert.equal(result.totalToSend, 650);
  assert.deepEqual(result.incoming, [
    {
      id: "incoming:anna:nikos",
      kind: "member",
      destination: "Anna",
      description: "For Electricity",
      amount: 49.7,
    },
  ]);
  assert.equal(result.totalExpectedBack, 49.7);
});

test("returns an empty review for a user outside the summary", () => {
  assert.deepEqual(buildBudgetReview(summary, "missing"), {
    outgoing: [],
    incoming: [],
    totalToSend: 0,
    totalExpectedBack: 0,
  });
});


test("supports older summaries without inventing reimbursements", () => {
  const legacy = JSON.parse(JSON.stringify(summary));
  delete legacy.reimbursements;
  for (const user of legacy.users) delete user.sharedAccountContribution;
  const result = buildBudgetReview(legacy, "anna");
  assert.equal(result.totalToSend, 700.2);
  assert.equal(result.outgoing.length, 2);
});

test("an explicit zero shared contribution stays zero", () => {
  const covered = JSON.parse(JSON.stringify(summary));
  covered.users[0].sharedAccountContribution = 0;
  assert.equal(buildBudgetReview(covered, "anna").totalToSend, 299.9);
});
