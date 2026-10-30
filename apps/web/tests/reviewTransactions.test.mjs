import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/utils/reviewTransactions.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const {
  getMerchantName, groupTransactionsByMerchant, sortMerchantGroups, sortTransactions,
  selectionState, toggleTransactionSelection,
} = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));

const tx = (id, overrides = {}) => ({
  id, date: "2026-09-14", description: "Sketi Glyka", amount: -12,
  categoryId: "food", userId: null, bankSource: "revolut", createdAt: "2026-10-29",
  ...overrides,
});

test("matching NBG and Revolut merchants group across bank boilerplate and punctuation", () => {
  const rows = [
    tx("a", { description: "040 ΚΕΝΤΡΙΚΟ - Sketi Glyka - 040 ΑΓΟΡΑ - SKETI GLYKA", bankSource: "nbg-xlsx" }),
    tx("b", { description: "SKETI-GLYKA" }),
  ];
  const groups = groupTransactionsByMerchant(rows);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].transactions.map((t) => t.id), ["a", "b"]);
  assert.equal(groups[0].moneyOutCents, 2400);
  assert.deepEqual(groups[0].bankSources, ["nbg-xlsx", "revolut"]);
});

test("NBG raw statement merchant is preferred to branch metadata", () => {
  assert.equal(getMerchantName(tx("a", {
    bankSource: "nbg-xlsx", description: "040 ΚΕΝΤΡΙΚΟ - WHOLE BANK DESCRIPTION",
    rawData: { row: { "Περιγραφή": "Mpougatsa Iordanis" } },
  })), "Mpougatsa Iordanis");
});

test("Greek accents, case and sigma variants match without fuzzy name matching", () => {
  const groups = groupTransactionsByMerchant([
    tx("a", { description: "ΓΑΛΑΞΙΑΣ" }), tx("b", { description: "Γαλαξίας" }),
    tx("c", { description: "Deligiannakis Geor" }), tx("d", { description: "Deligiannakis Nikola" }),
  ]);
  assert.equal(groups.length, 3);
  assert.equal(groups.find((g) => g.transactions.length === 2).moneyOutCents, 2400);
});

test("different funding cards and transfer directions remain separate", () => {
  assert.equal(groupTransactionsByMerchant([
    tx("a", { description: "Apple Pay top-up by *9048" }),
    tx("b", { description: "Apple Pay top-up by *6497" }),
    tx("c", { description: "To Anna Fragkou" }), tx("d", { description: "From Anna Fragkou" }),
  ]).length, 4);
});

test("totals keep payments and credits separate and sum in cents", () => {
  const [group] = groupTransactionsByMerchant([
    tx("a", { amount: "-10.10" }), tx("b", { amount: "-0.20" }), tx("c", { amount: "3.05" }),
  ]);
  assert.equal(group.moneyOutCents, 1030);
  assert.equal(group.moneyInCents, 305);
  assert.equal(group.netCents, -725);
});

test("internal transfer groups retain both sides of a movement", () => {
  const [group] = groupTransactionsByMerchant([
    tx("a", { description: "Pocket Withdrawal", amount: -600 }),
    tx("b", { description: "Pocket Withdrawal", amount: 600 }),
  ]);
  assert.equal(group.moneyOutCents, 60000);
  assert.equal(group.moneyInCents, 60000);
  assert.equal(group.netCents, 0);
  assert.equal(group.transactions.length, 2);
});

test("groups report mixed categories and the full date range", () => {
  const [group] = groupTransactionsByMerchant([
    tx("a", { date: "2026-09-20" }),
    tx("b", { date: "2026-09-14", categoryId: "uncategorized" }), tx("c", { date: "2026-09-16" }),
  ]);
  assert.equal(group.firstDate, "2026-09-14");
  assert.equal(group.lastDate, "2026-09-20");
  assert.equal(group.categoryId, null);
});

test("amount sorting uses numeric magnitude, including strings and credits", () => {
  const rows = [tx("a", { amount: "-9" }), tx("b", { amount: "-100.01" }), tx("c", { amount: "20" })];
  assert.deepEqual(sortTransactions(rows, "amount-desc").map((t) => t.id), ["b", "c", "a"]);
  assert.deepEqual(sortTransactions(rows, "amount-asc").map((t) => t.id), ["a", "c", "b"]);
  assert.deepEqual(rows.map((t) => t.id), ["a", "b", "c"]);
});

test("merchant sorting compares outflows, inflows, frequency and dates independently", () => {
  const groups = groupTransactionsByMerchant([
    tx("a", { description: "Small", amount: -10 }),
    tx("b", { description: "Large", amount: -100, date: "2026-09-15" }),
    tx("c", { description: "Credit", amount: 500 }), tx("d", { description: "Small", amount: -5 }),
  ]);
  assert.equal(sortMerchantGroups(groups, "out-desc")[0].name, "Large");
  assert.equal(sortMerchantGroups(groups, "in-desc")[0].name, "Credit");
  assert.equal(sortMerchantGroups(groups, "count-desc")[0].name, "Small");
  assert.equal(sortMerchantGroups(groups, "date-desc")[0].name, "Large");
});

test("group actions include only rows supplied by the active filters", () => {
  const [group] = groupTransactionsByMerchant([tx("visible", { userId: "person-a" })]);
  assert.deepEqual(group.transactions.map((t) => t.id), ["visible"]);
  assert.equal(group.transactions[0].userId, "person-a");
});

test("partial selection adds the remaining group rows and preserves other selections", () => {
  assert.deepEqual(selectionState(new Set(["a"]), ["a", "b"]), { checked: false, indeterminate: true });
  assert.deepEqual([...toggleTransactionSelection(new Set(["a", "other"]), ["a", "b"])].sort(), ["a", "b", "other"]);
  assert.deepEqual([...toggleTransactionSelection(new Set(["a", "b", "other"]), ["a", "b"])], ["other"]);
});

test("grouping and sorting do not mutate transaction data or ownership", () => {
  const rows = [tx("a"), tx("b", { amount: 4, userId: "person-a" })];
  const before = JSON.stringify(rows);
  sortMerchantGroups(groupTransactionsByMerchant(rows), "out-desc");
  sortTransactions(rows, "date-asc");
  assert.equal(JSON.stringify(rows), before);
});

test("invalid amounts are not silently displayed as zero", () => {
  assert.throws(() => groupTransactionsByMerchant([tx("a", { amount: "invalid" })]), /Invalid transaction amount/);
});

test("empty results produce no merchant groups or selection", () => {
  assert.deepEqual(groupTransactionsByMerchant([]), []);
  assert.deepEqual(selectionState(new Set(), []), { checked: false, indeterminate: false });
});

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const esbuild = require(require.resolve("esbuild", { paths: [require.resolve("vite")] }));
const built = esbuild.buildSync({
  entryPoints: [fileURLToPath(new URL("../src/components/MerchantReviewGroup.tsx", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "cjs",
  external: ["react", "react/jsx-runtime", "lucide-react"],
});
const componentModule = { exports: {} };
runInNewContext(built.outputFiles[0].text, {
  module: componentModule, exports: componentModule.exports, require, console,
});
const { MerchantReviewGroup } = componentModule.exports;

const groupProps = () => ({
  group: groupTransactionsByMerchant([tx("a", { amount: -10 }), tx("b", { amount: 3, categoryId: "refunds" })])[0],
  categories: [{ id: "food", name: "Food & Drinks" }, { id: "refunds", name: "Refunds" }],
  selected: new Set(), expanded: false, isUpdating: false,
  onToggleSelect() {}, onToggleExpand() {}, onCategoryChange() {},
});

test("merchant card renders separate totals, mixed categories and expandable details", () => {
  const props = groupProps();
  const collapsed = renderToStaticMarkup(React.createElement(MerchantReviewGroup, props, "Purchase details"));
  for (const label of ["Money out", "Money in", "Net", "€10.00", "€3.00", "-€7.00", "Mixed categories", "Category for all 2 transactions"]) {
    assert.ok(collapsed.includes(label), label);
  }
  assert.ok(collapsed.includes('aria-expanded="false"'));
  assert.ok(!collapsed.includes("Purchase details"));
  const expanded = renderToStaticMarkup(React.createElement(MerchantReviewGroup, { ...props, expanded: true }, "Purchase details"));
  assert.ok(expanded.includes('aria-expanded="true"'));
  assert.ok(expanded.includes("Purchase details"));
  assert.ok(expanded.includes("Hide transactions"));
});

test("merchant category and selection controls call their explicit group actions", () => {
  const calls = [];
  const props = {
    ...groupProps(),
    onToggleSelect: () => calls.push("select"),
    onToggleExpand: () => calls.push("expand"),
    onCategoryChange: (categoryId) => calls.push(categoryId),
  };
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    visit(node.props?.children);
  };
  visit(MerchantReviewGroup(props));
  nodes.find((node) => node.type === "input").props.onChange();
  nodes.find((node) => node.type === "button").props.onClick();
  nodes.find((node) => node.type === "select").props.onChange({ target: { value: "food" } });
  assert.deepEqual(calls, ["select", "expand", "food"]);
  const disabled = renderToStaticMarkup(React.createElement(MerchantReviewGroup, { ...props, isUpdating: true }));
  assert.ok(/<select[^>]*disabled/.test(disabled));
});
