import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = readFileSync(new URL("../src/lib/budgetMonths.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { currentBudgetMonth, isBudgetMonth, getBudgetReviewMonth, adjacentBudgetMonth, budgetMonthSearch } =
  await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));

test("specific months are selected and invalid URLs fall back to the current month", () => {
  assert.equal(getBudgetReviewMonth("2026-11", "2026-10"), "2026-11");
  for (const value of [null, "", "2026-00", "2026-13", "2026-1", "not-a-month", "0000-01"]) {
    assert.equal(getBudgetReviewMonth(value, "2026-10"), "2026-10");
  }
  assert.equal(isBudgetMonth("2026-01"), true);
});

test("previous and next month navigation crosses calendar years", () => {
  assert.equal(adjacentBudgetMonth("2026-12", 1), "2027-01");
  assert.equal(adjacentBudgetMonth("2026-01", -1), "2025-12");
  assert.equal(adjacentBudgetMonth("2024-02", 1), "2024-03");
  assert.equal(adjacentBudgetMonth("0001-01", -1), null);
  assert.equal(adjacentBudgetMonth("9999-12", 1), null);
});

test("current month uses the local calendar", () => {
  assert.equal(currentBudgetMonth(new Date(2026, 9, 30, 12)), "2026-10");
});

test("month URLs preserve other parameters and This month restores the dynamic default", () => {
  const original = new URLSearchParams("member=anna&month=2026-09");
  const next = budgetMonthSearch(original, "2026-11", "2026-10");
  assert.equal(next.get("month"), "2026-11");
  assert.equal(next.get("member"), "anna");
  assert.equal(original.get("month"), "2026-09");
  const current = budgetMonthSearch(next, "2026-10", "2026-10");
  assert.equal(current.has("month"), false);
  assert.equal(current.get("member"), "anna");
});

const require = createRequire(import.meta.url);
const esbuild = require(require.resolve("esbuild", { paths: [require.resolve("vite")] }));
const built = esbuild.buildSync({
  entryPoints: [fileURLToPath(new URL("../src/components/BudgetMonthNavigation.tsx", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "cjs",
  external: ["react", "react/jsx-runtime", "lucide-react"],
});
const loaded = { exports: {} };
runInNewContext(built.outputFiles[0].text, { module: loaded, exports: loaded.exports, require, console });
const { BudgetMonthNavigation } = loaded.exports;

test("month controls render an accessible picker and preserve the selected month", () => {
  const html = renderToStaticMarkup(React.createElement(BudgetMonthNavigation, {
    month: "2026-11", currentMonth: "2026-10", onChange() {},
  }));
  for (const label of ["Review month", "Previous month", "Next month", "This month", 'type="month"', 'value="2026-11"']) {
    assert.ok(html.includes(label), label);
  }
});

test("previous, next, month picker and This month use their selected values", () => {
  const changes = [];
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    visit(node.props?.children);
  };
  visit(BudgetMonthNavigation({ month: "2026-12", currentMonth: "2026-10", onChange: (month) => changes.push(month) }));
  nodes.find((node) => node.props?.["aria-label"] === "Previous month").props.onClick();
  nodes.find((node) => node.props?.["aria-label"] === "Next month").props.onClick();
  nodes.find((node) => node.type === "input").props.onChange({ target: { value: "2025-06" } });
  nodes.find((node) => node.type === "input").props.onChange({ target: { value: "" } });
  nodes.find((node) => node.type === "button" && !node.props["aria-label"]).props.onClick();
  assert.deepEqual(changes, ["2026-11", "2027-01", "2025-06", "2026-10"]);
});

import { StaticRouter } from "react-router-dom/server.js";

const pageFixture = {
  household: { id: "home", name: "Test household" },
  users: [{ id: "anna", nickname: "Anna", color: "#6366f1" }],
  plans: [
    { id: "october", month: "2026-10", status: "active" },
    { id: "november", month: "2026-11", status: "draft" },
  ],
  summaries: {
    october: { users: [{ userId: "anna", sharedAccountContribution: 400, savingsTarget: 20, pct: 0.5 }], reimbursements: [] },
    november: { users: [{ userId: "anna", sharedAccountContribution: 100, savingsTarget: 20, pct: 0.5 }], reimbursements: [] },
  },
  requested: [],
};
const pageBuild = await esbuild.build({
  entryPoints: [fileURLToPath(new URL("../src/pages/BudgetNow.tsx", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "cjs",
  external: ["react", "react/jsx-runtime", "lucide-react", "react-router-dom"],
  plugins: [{
    name: "budget-page-fixtures",
    setup(build) {
      build.onResolve({ filter: /HouseholdContext$|api\/budgets$|^@tanstack\/react-query$/ }, (args) => ({
        path: args.path, namespace: "budget-fixture",
      }));
      build.onLoad({ filter: /.*/, namespace: "budget-fixture" }, (args) => ({
        contents: args.path.endsWith("HouseholdContext")
          ? "export const useHousehold = () => globalThis.__budgetPageFixture;"
          : args.path.endsWith("api/budgets")
            ? "export const listBudgetPlans = () => {throw new Error('Unexpected API call')}; export const getBudgetSummary = listBudgetPlans;"
            : `export function useQuery(options) {
                const fixture = globalThis.__budgetPageFixture;
                if (options.queryKey[0] === "budget-plans") return { data: fixture.plans, isPending: false, isError: false };
                if (!options.enabled) return { data: undefined, isPending: true, isError: false };
                fixture.requested.push(options.queryKey[2]);
                return { data: fixture.summaries[options.queryKey[2]], isPending: false, isError: false };
              }`,
        loader: "js",
      }));
    },
  }],
});
const pageModule = { exports: {} };
runInNewContext(pageBuild.outputFiles[0].text, {
  module: pageModule, exports: pageModule.exports, require, console, __budgetPageFixture: pageFixture,
});
const { BudgetNow } = pageModule.exports;

test("the full review page requests and displays the selected month's saved plan", () => {
  pageFixture.requested.length = 0;
  const html = renderToStaticMarkup(React.createElement(StaticRouter, {
    location: "/budget/review/now?month=2026-11",
  }, React.createElement(BudgetNow)));
  assert.deepEqual(pageFixture.requested, ["november"]);
  assert.ok(html.includes('value="2026-11"'));
  assert.ok(html.includes("Monthly money review"));
  assert.ok(html.includes(new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(120)));
  assert.ok(html.includes('href="/budget?month=2026-11"'));
});

test("a month without a budget retains navigation and does not reuse another month's summary", () => {
  pageFixture.requested.length = 0;
  const html = renderToStaticMarkup(React.createElement(StaticRouter, {
    location: "/budget/review/now?month=2027-02",
  }, React.createElement(BudgetNow)));
  assert.deepEqual(pageFixture.requested, []);
  assert.ok(html.includes("No budget to review yet"));
  assert.ok(html.includes("Previous month"));
  assert.ok(html.includes("Next month"));
  assert.ok(html.includes('value="2027-02"'));
  assert.ok(html.includes('href="/budget?month=2027-02"'));
});
