import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.js";

function load(relative, mocks = {}) {
  const source = readFileSync(new URL("../src/" + relative, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const exports = {};
  runInNewContext(outputText, { exports, URLSearchParams, require(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error("Unexpected dependency: " + name);
  } });
  return exports;
}
const ledger = load("lib/financeLedger.ts");
const { buildForecast } = load("lib/spendingForecast.ts", { "./financeLedger": ledger });
const tx = (id, amount, overrides = {}) => ({
  id, date: "2026-10-10", description: "Merchant", amount, categoryId: "food",
  userId: null, householdId: "home", bankSource: "revolut", ...overrides,
});
const pocket = (id, date, amount, balance, overrides = {}) => tx(id, amount, {
  date, description: "To pocket EUR Shared fund from EUR", categoryId: "transfer/own-account", isExcludedFromAnalytics: true,
  rawData: { Product: "Savings", timeStr: "12:00:00", row: ["Transfer", "Savings", date + " 12:00:00", date + " 12:00:00", "", String(amount), "0", "EUR", "COMPLETED", String(balance)] },
  ...overrides,
});
const options = (overrides = {}) => ({ month: "2026-10", today: "2026-10-15", scope: "shared",
  items: [{ type: "expense", userId: null, categoryId: "food", amount: 200 }],
  oneOffCategories: ["travel", "refunds", "cash"], includeCash: false, ...overrides });

test("money parsing preserves cents, zero and European balances; invalid values stay unavailable", () => {
  for (const [value, expected] of [["1.234,56",123456], ["1,234.56",123456], ["€ 0,00",0], [-0.29,-29], ["20.01",2001], [null,null], ["",null], ["unknown",null]]) assert.equal(ledger.moneyCents(value), expected);
});
test("a Pocket ledger reconciles every movement without adding the current-account mirror", () => {
  const rows = [pocket("a","2026-09-01",100,150), pocket("b","2026-09-02",-20,130),
    pocket("c","2026-10-03",10,140), tx("mirror",-100,{date:"2026-09-01",rawData:{Product:"Current"}})];
  const all = ledger.buildLedgers(rows); const [saving] = ledger.savingsLedgers(all);
  assert.equal(saving.rows.length,3); assert.equal(saving.opening,5000); assert.equal(saving.closing,14000);
  assert.equal(saving.incoming,11000); assert.equal(saving.outgoing,2000); assert.equal(saving.difference,0);
  assert.equal(ledger.ledgerStatus(saving),"matches");
  const month = ledger.savingsPeriod(saving,"2026-09");
  assert.equal(month.net,8000); assert.equal(month.closing,13000);
});
test("Revolut running balances follow completed times, even when card payments started in a different order", () => {
  const a=pocket("a","2026-10-02",-10,100), b=pocket("b","2026-10-02",-20,80);
  a.rawData.timeStr="15:00:00";a.rawData.row[2]="2026-10-01 15:00:00";a.rawData.row[3]="2026-10-02 10:00:00";
  b.rawData.timeStr="09:00:00";b.rawData.row[2]="2026-10-01 09:00:00";b.rawData.row[3]="2026-10-02 11:00:00";
  const [account]=ledger.buildLedgers([b,a]);
  assert.equal(account.issues.length,0);assert.equal(ledger.ledgerStatus(account),"matches");
});
test("an inactive month carries a dated recorded balance, and earlier months are unavailable", () => {
  const [saving] = ledger.buildLedgers([pocket("a","2026-08-01",10,40), pocket("b","2026-10-01",10,50)]);
  assert.equal(ledger.savingsPeriod(saving,"2026-09").closing,4000);
  assert.equal(ledger.savingsPeriod(saving,"2026-09").balanceDate,"2026-08-01");
  assert.equal(ledger.savingsPeriod(saving,"2026-07").closing,null);
  assert.deepEqual(Array.from(saving.missingMonths),["2026-09"]);
});
test("currency, owner and product ledgers remain separate", () => {
  const usd = pocket("usd","2026-10-02",5,25); usd.rawData.row[7]="USD";
  const all = ledger.buildLedgers([pocket("shared","2026-10-01",1,21), pocket("personal","2026-10-01",1,30,{userId:"person"}),usd]);
  assert.equal(all.length,3);
});
test("a real running-balance gap is reported in cents", () => {
  const [saving] = ledger.buildLedgers([pocket("a","2026-10-01",10,20),pocket("b","2026-10-02",5,30)]);
  assert.equal(saving.issues[0].kind,"balance"); assert.equal(saving.issues[0].difference,500);
  assert.equal(saving.difference,500); assert.equal(ledger.ledgerStatus(saving),"review");
});
test("possible duplicates are surfaced without silently deleting rows", () => {
  const original=pocket("a","2026-10-01",10,20); const copy={...original,id:"b"};
  const [saving]=ledger.buildLedgers([original,copy]);
  assert.equal(saving.rows.length,2); assert.equal(saving.issues.filter((issue)=>issue.kind==="duplicate").length,1);
  assert.equal(ledger.ledgerStatus(saving),"review");
});
test("a shared NBG reference is not evidence of a duplicate", () => {
  const nbg = (id,amount,time,balance)=>tx(id,amount,{bankSource:"nbg-xlsx",bankReference:"shared-reference",rawData:{row:{"Ώρα":time,"Λογιστικό Υπόλοιπο":balance,"Νόμισμα":"EUR"}}});
  const [account] = ledger.buildLedgers([nbg("a",-10,"10:00","100,00"),nbg("b",-20,"11:00","80,00")]);
  assert.equal(account.issues.length,0); assert.equal(ledger.ledgerStatus(account),"matches");
});
test("ambiguous same-time entries and unavailable balances are never called reconciled", () => {
  const a=pocket("a","2026-10-01",10,20),b=pocket("b","2026-10-01",10,30);
  const [saving]=ledger.buildLedgers([a,b]);
  assert.equal(ledger.ledgerStatus(saving),"partial");
  assert.equal(ledger.ledgerStatus(ledger.buildLedgers([tx("none",-1,{rawData:{}})])[0]),"unavailable");
});
test("missing intermediate balances prevent a fully checked status", () => {
  const middle=pocket("b","2026-10-02",5,25);middle.rawData.row[9]="";
  const [saving]=ledger.buildLedgers([pocket("a","2026-10-01",10,20),middle,pocket("c","2026-10-03",5,30)]);
  assert.equal(saving.difference,0);assert.equal(ledger.ledgerStatus(saving),"partial");
});
test("forecast separates one-off spending from recurring pace and respects budget scope", () => {
  const result=buildForecast([tx("food",-100),tx("holiday",-300,{categoryId:"travel"}),tx("personal",-500,{userId:"person"})],options());
  assert.equal(result.actual,40000); assert.equal(result.projected,61000);assert.equal(result.planned,20000);assert.equal(result.remaining,-20000);
  assert.equal(result.unbudgeted,30000);
});
test("income, internal transfers, investments and excluded entries do not inflate spending", () => {
  const rows=[tx("food",-10),tx("income",2000,{categoryId:"income"}),tx("transfer",-100,{categoryId:"transfer/own-account",countAsExpense:true}),
    tx("member",-50,{categoryId:"transfer/to-household-member",countAsExpense:true}),tx("excluded",-20,{isExcludedFromAnalytics:true}),
    tx("invest",-100,{categoryId:"investment"}),tx("external",-60,{categoryId:"transfer/to-external-member"}),
    tx("external-expense",-5,{categoryId:"transfer/to-external-member",countAsExpense:true})];
  assert.equal(buildForecast(rows,options()).actual,1500);
});
test("same-category refunds offset spending, but unclassified credits are not assumed to be refunds", () => {
  const result=buildForecast([tx("paid",-100),tx("refund",10),tx("unknown",500,{categoryId:"uncategorized"}),tx("unknown-debit",-20,{categoryId:"uncategorized"})],options());
  assert.equal(result.actual,11000);assert.equal(result.unknownCredits,50000);assert.equal(result.unknownDebits,2000);
});
test("cash withdrawals are optional and cannot silently become recorded purchases", () => {
  const rows=[tx("food",-10),tx("cash",-100,{categoryId:"cash"})];
  const excluded=buildForecast(rows,options()); const included=buildForecast(rows,options({includeCash:true}));
  assert.equal(excluded.actual,1000);assert.equal(excluded.cash,10000);assert.equal(included.actual,11000);
});
test("forecast uses the latest imported date, not today's date, to scale the pace", () => {
  const result=buildForecast([tx("a",-100,{date:"2026-10-10"})],options({today:"2026-10-20"}));
  assert.equal(result.projected,31000); assert.equal(result.observedThrough,"2026-10-10"); assert.equal(result.remainingDays,12);
});
test("past months show actual totals, while future and empty current months have no projection", () => {
  assert.equal(buildForecast([tx("a",-100)],options({today:"2026-11-01"})).projected,10000);
  const future=buildForecast([],options({month:"2026-11"})); assert.equal(future.projected,null);
  assert.equal(buildForecast([],options()).projected,null);
});
test("future-dated entries are not used in the current month's forecast", () => {
  assert.equal(buildForecast([tx("future",-1000,{date:"2026-10-31"})],options()).actual,0);
});
test("month lengths and daily allowance handle leap years and over-budget months", () => {
  assert.equal(ledger.monthEnd("2028-02"),"2028-02-29");
  assert.equal(ledger.monthEnd("2026-02"),"2026-02-28");
  assert.equal(buildForecast([tx("a",-500)],options()).dailyAllowance,0);
  assert.equal(buildForecast([],options({month:"2028-02",today:"2028-02-28"})).remainingDays,2);
});
test("foreign-currency entries are excluded from EUR forecasts", () => {
  const usd=pocket("usd","2026-10-10",-100,100,{categoryId:"food",isExcludedFromAnalytics:false});usd.rawData.row[7]="USD";
  const result=buildForecast([usd,tx("eur",-10)],options());
  assert.equal(result.actual,1000);assert.equal(result.foreignTransactions,1);
});
test("household and personal scopes do not double-count shared expenses", () => {
  const rows=[tx("shared",-10),tx("personal",-20,{userId:"p"})];
  assert.equal(buildForecast(rows,options({scope:"household"})).actual,3000);
  assert.equal(buildForecast(rows,options({scope:"p"})).actual,2000);
});
test("data access excludes orphaned imports and records from other households", async () => {
  const finance=load("api/finance.ts",{"./client":{apiClient:{get:async()=>[tx("mine",-10),tx("orphan",-100,{householdId:null}),tx("other",-1000,{householdId:"other"})]}}});
  const result=await finance.getFinanceTransactions("home");
  assert.deepEqual(Array.from(result,(t)=>t.id),["mine"]);
});

const require=createRequire(import.meta.url);
const viteRequire=createRequire(require.resolve("vite"));
const {build}=viteRequire("esbuild");
const fixture=[pocket("a","2026-09-01",100,150),pocket("b","2026-10-03",10,160),tx("food",-30,{date:"2026-10-10"})];
async function renderPage(page,{state="ready",empty=false,month="2026-10"}={}) {
  const result=await build({
    entryPoints:[fileURLToPath(new URL("../src/pages/"+page+".tsx",import.meta.url))],
    bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",
    external:["react","react-dom","react-router-dom","react-router-dom/*","react/jsx-runtime"],
    plugins:[{name:"fixtures",setup(builder){
      builder.onResolve({filter:/HouseholdContext$/},()=>({path:"household",namespace:"fixture"}));
      builder.onResolve({filter:/^@tanstack\/react-query$/},()=>({path:"query",namespace:"fixture"}));
      builder.onResolve({filter:/\/api\/(finance|budgets|insights)$/},()=>({path:"api",namespace:"fixture"}));
      builder.onLoad({filter:/.*/,namespace:"fixture"},({path})=>{
        if(path==="household")return{contents:'export const useHousehold=()=>({household:{id:"home",defaultSavingsTarget:800},users:[],isLoading:false});'};
        if(path==="api")return{contents:'export const getFinanceTransactions=()=>{};export const listBudgetPlans=()=>{};export const getBudgetPlan=()=>{};export const getCategories=()=>{};'};
        const data=empty?[]:fixture;
        return{contents:`export function useQuery(options){
          const key=options.queryKey[0], loading=key==="finance-transactions"&&${JSON.stringify(state)}==="loading",error=key==="finance-transactions"&&${JSON.stringify(state)}==="error";
          const data=key==="finance-transactions"?${JSON.stringify(data)}:key==="budget-plans"?[{id:"plan",month:"2026-10",savingsTarget:800}]:key==="budget-plan"?{id:"plan",items:[{type:"expense",categoryId:"food",amount:100,userId:null}]}:[{id:"food",name:"Food & Drinks"}];
          return{data:loading||error||options.enabled===false?undefined:data,isPending:loading||options.enabled===false,isError:error,isSuccess:!loading&&!error&&options.enabled!==false,error:new Error("Offline"),refetch:()=>{}};
        }`};
      });
    }}],
  });
  const module={exports:{}}; runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require,URLSearchParams,Date,Intl,console});
  return renderToStaticMarkup(React.createElement(StaticRouter,{location:"/test?month="+month},React.createElement(module.exports[page])));
}
test("Savings renders dated balances, monthly activity and target without summing mirror legs",async()=>{
  const html=await renderPage("Savings");assert.match(html,/Last recorded balance/);assert.match(html,/160\.00/);assert.match(html,/2026-10-03/);assert.match(html,/Pocket activity/);assert.match(html,/Monthly savings target/);
});
test("Accounts renders reconciliation status and inferred opening explanations",async()=>{
  const html=await renderPage("Accounts");assert.match(html,/Account reconciliation/);assert.match(html,/Running balances match/);assert.match(html,/Inferred opening/);assert.match(html,/Balance not provided/);
});
test("SpendingForecast renders scope, assumptions, budget and data quality controls",async()=>{
  const html=await renderPage("SpendingForecast");for(const text of [/Shared expenses/,/Forecast assumptions/,/One-off categories/,/Include cash withdrawals/,/Spending by category/])assert.match(html,text);
});
test("all three pages show errors and loading states without fabricated zero balances",async()=>{
  for(const page of ["Savings","Accounts","SpendingForecast"]){
    assert.match(await renderPage(page,{state:"error"}),/Transactions could not be loaded/);
    assert.match(await renderPage(page,{state:"loading"}),/Loading imported transactions/);
  }
});
test("Savings offers an upload action when no Pocket data is available",async()=>{
  assert.match(await renderPage("Savings",{empty:true}),/No Revolut Pocket records yet/);
});

test("a month without a budget never borrows the prior saved plan",async()=>{
  const html=await renderPage("SpendingForecast",{month:"2026-11"});
  assert.match(html,/No budget exists for/);
  assert.match(html,/2026-11/);
  assert.doesNotMatch(html,/€100\.00/);
});
