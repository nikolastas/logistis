const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");

function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error("Unexpected dependency: " + name);
  } });
  return exports;
}
const joint = load("services/jointAccountCounterparty.ts");
const { classifyTransfer } = load("services/transferDetectionService.ts", {
  "typeorm": { IsNull() {} }, "../entities/Transaction": {}, "../db": {},
  "./jointAccountCounterparty": joint,
});
const users = [
  { id: "nikos", householdId: "home", nameAliases: ["Nikolaos Tasiopoulos"] },
  { id: "anna", householdId: "home", nameAliases: ["Anna Fragkou"] },
];
const name = "Anna Fragkou & NIKOLAOS TASIOPOULOS";
test("the reported joint name is an excluded own-account transfer in either direction", () => {
  for (const amount of [310, -310]) {
    const result = classifyTransfer("Transfer from " + name, amount, users, { Type: "TRANSFER", transferCounterparty: name }, "nikos");
    assert.equal(result.categoryId, "transfer/own-account");
    assert.equal(result.transferType, "own_account");
    assert.equal(result.isExcludedFromAnalytics, true);
    assert.equal(result.transferCounterpartyUserId, null);
  }
});
test("holder order, case and repeated whitespace do not affect the match", () => {
  assert.equal(joint.isJointHouseholdCounterparty(" NIKOLAOS   TASIOPOULOS & anna fragkou ", users), true);
});
test("an unknown co-holder stays external", () => {
  assert.equal(joint.isJointHouseholdCounterparty("Anna Fragkou & Someone Else", users), false);
  const result = classifyTransfer("Transfer from X", 310, users, { Type: "TRANSFER", transferCounterparty: "Anna Fragkou & Someone Else" }, "nikos");
  assert.equal(result.transferType, "third_party");
});
test("single names and the same holder repeated are not joint accounts", () => {
  for (const value of ["Anna Fragkou", "Anna Fragkou & Anna Fragkou", "Anna Fragkou &", ""]) {
    assert.equal(joint.isJointHouseholdCounterparty(value, users), false);
  }
});
test("matching names across different households do not qualify", () => {
  assert.equal(joint.isJointHouseholdCounterparty(name, [users[0], { ...users[1], householdId: "other" }]), false);
});
test("ambiguous aliases and missing aliases do not qualify", () => {
  assert.equal(joint.isJointHouseholdCounterparty(name, [...users, { id: "other", householdId: "home", nameAliases: ["Anna Fragkou"] }]), false);
  assert.equal(joint.isJointHouseholdCounterparty(name, [users[0], { ...users[1], nameAliases: [] }]), false);
});
test("individual household transfers retain their existing classification", () => {
  const result = classifyTransfer("Transfer from Anna Fragkou", 310, users, { Type: "TRANSFER", transferCounterparty: "Anna Fragkou" }, "nikos");
  assert.equal(result.transferType, "household_member");
});
