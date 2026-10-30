export interface FinanceTransaction {
  id: string; date: string; description: string; amount: number | string;
  categoryId: string; userId: string | null; bankSource: string;
  householdId?: string | null; bankReference?: string | null;
  rawData?: Record<string, unknown> | null; note?: string | null;
  linkedTransactionId?: string | null; isExcludedFromAnalytics?: boolean; countAsExpense?: boolean;
}
export interface LedgerRow {
  transaction: FinanceTransaction; amount: number; balance: number | null;
  date: string; time: string; currency: string; product: string; uncertainOrder: boolean;
}
export interface LedgerIssue { kind: "balance" | "duplicate" | "order"; transactionId: string; date: string; message: string; difference: number | null; }
export interface Ledger {
  id: string; bank: string; userId: string | null; product: string; currency: string; pocketNames: string[];
  rows: LedgerRow[]; opening: number | null; closing: number | null; balanceDate: string | null;
  incoming: number; outgoing: number; net: number; difference: number | null;
  issues: LedgerIssue[]; balanceCount: number; missingMonths: string[];
}
export function moneyCents(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  let text = String(value).trim().replace(/[€\s]/g, "");
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (text.includes(",")) text = text.replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? Math.round((number + Math.sign(number) * Number.EPSILON) * 100) : null;
}
export function monthEnd(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(0); date.setUTCFullYear(year, m, 0);
  return month + "-" + String(date.getUTCDate()).padStart(2, "0");
}
function monthsBetween(first: string, last: string): string[] {
  let [year, month] = first.slice(0, 7).split("-").map(Number);
  const result: string[] = [];
  for (let n = 0; n < 1200; n++) {
    const key = String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0");
    if (key > last.slice(0, 7)) break;
    result.push(key); if (++month === 13) { month = 1; year++; }
  }
  return result;
}
export function readLedgerRow(transaction: FinanceTransaction): LedgerRow {
  const raw = transaction.rawData ?? {};
  const row = raw.row;
  const csv = Array.isArray(row) ? row : [];
  const record = row && !Array.isArray(row) && typeof row === "object" ? row as Record<string, unknown> : {};
  const revolut = transaction.bankSource === "revolut";
  const product = revolut ? String(raw.Product ?? csv[1] ?? "Current") : "Account";
  const currency = String(revolut ? csv[7] ?? raw.Currency ?? "EUR" : record["Νόμισμα"] || raw.currency || "EUR").toUpperCase().trim();
  const balance = moneyCents(revolut ? csv[9] ?? raw.balance : record["Λογιστικό Υπόλοιπο"] ?? raw.balance ?? raw.Balance);
  const timeSource = revolut ? csv[3] || raw.timeStr || csv[2] : record["Ώρα"] ?? raw.time;
  const clock = String(timeSource ?? "").match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  const time = clock ? clock[1].padStart(2, "0") + ":" + clock[2] + ":" + (clock[3] ?? "00") : "";
  return { transaction, amount: moneyCents(transaction.amount) ?? 0, balance, date: transaction.date, time, currency, product, uncertainOrder: false };
}
export function buildLedgers(transactions: readonly FinanceTransaction[]): Ledger[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const transaction of transactions) {
    const row = readLedgerRow(transaction);
    const id = JSON.stringify([transaction.bankSource, transaction.userId, row.product.toLowerCase(), row.currency]);
    const group = groups.get(id) ?? []; group.push(row); groups.set(id, group);
  }
  const result: Ledger[] = [];
  for (const [id, original] of groups) {
    const rows = original.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.transaction.id.localeCompare(b.transaction.id));
    const stamps = new Map<string, number>();
    for (const row of rows) { const stamp = row.date + row.time; stamps.set(stamp, (stamps.get(stamp) ?? 0) + 1); }
    for (const row of rows) row.uncertainOrder = (stamps.get(row.date + row.time) ?? 0) > 1;
    const issues: LedgerIssue[] = []; const seen = new Map<string, string>();
    let previous: LedgerRow | null = null; let expected: number | null = null; let total = 0;
    for (const row of rows) {
      const t = row.transaction;
      // References alone can describe several distinct NBG charges.
      const identity = row.balance !== null && row.time ? JSON.stringify([row.date, row.time, row.amount, row.balance, t.description.normalize("NFC").trim()]) : null;
      if (identity && seen.has(identity)) issues.push({ kind: "duplicate", transactionId: t.id, date: row.date, message: "Same time, amount, description and running balance as another entry. Review before deleting.", difference: null });
      if (identity) seen.set(identity, t.id);
      if (row.uncertainOrder && (!previous || previous.date + previous.time !== row.date + row.time)) issues.push({ kind: "order", transactionId: t.id, date: row.date, message: "Several entries share this date/time; their order cannot be verified.", difference: null });
      total += row.amount;
      if (expected !== null) expected += row.amount;
      if (row.balance !== null) {
        if (expected !== null && expected !== row.balance && !row.uncertainOrder && !previous?.uncertainOrder) {
          issues.push({ kind: "balance", transactionId: t.id, date: row.date, message: "Running balance differs from the previous recorded balance plus imported movements.", difference: row.balance - expected });
        }
        expected = row.balance;
      }
      previous = row;
    }
    const balanced = rows.filter((row) => row.balance !== null);
    const first = rows[0]; const last = rows[rows.length - 1]; const lastBalance = balanced[balanced.length - 1];
    const opening = first.balance !== null && !first.uncertainOrder ? first.balance - first.amount : null;
    const difference = opening !== null && last.balance !== null && !last.uncertainOrder ? last.balance - opening - total : null;
    const knownMonths = new Set(rows.map((row) => row.date.slice(0, 7)));
    const names = new Set<string>();
    for (const row of rows) {
      const match = row.transaction.description.match(/^To pocket [A-Z]{3} (.+) from [A-Z]{3}$/i);
      if (match) names.add(match[1]);
    }
    result.push({
      id, bank: first.transaction.bankSource, userId: first.transaction.userId, product: first.product, currency: first.currency,
      pocketNames: [...names].sort(), rows, opening, closing: lastBalance?.balance ?? null, balanceDate: lastBalance?.date ?? null,
      incoming: rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0),
      outgoing: rows.reduce((sum, row) => sum + Math.max(0, -row.amount), 0), net: total, difference, issues, balanceCount: balanced.length,
      missingMonths: monthsBetween(first.date, last.date).filter((month) => !knownMonths.has(month)),
    });
  }
  return result.sort((a, b) => a.bank.localeCompare(b.bank) || String(a.userId ?? "").localeCompare(String(b.userId ?? "")) || a.product.localeCompare(b.product));
}
export function savingsLedgers(ledgers: readonly Ledger[]): Ledger[] {
  return ledgers.filter((ledger) => ledger.bank === "revolut" && /^(savings|vaults?)$/i.test(ledger.product));
}
export function savingsPeriod(ledger: Ledger, month: string) {
  const before = ledger.rows.filter((row) => row.date < month + "-01" && row.balance !== null);
  const during = ledger.rows.filter((row) => row.date.slice(0, 7) === month);
  const through = ledger.rows.filter((row) => row.date <= monthEnd(month) && row.balance !== null);
  const last = through[through.length - 1];
  const first = during[0];
  return {
    incoming: during.reduce((sum, row) => sum + Math.max(0, row.amount), 0),
    outgoing: during.reduce((sum, row) => sum + Math.max(0, -row.amount), 0),
    net: during.reduce((sum, row) => sum + row.amount, 0), rows: during,
    opening: before[before.length - 1]?.balance ?? (first?.balance !== null && first?.balance !== undefined && !first.uncertainOrder ? first.balance - first.amount : null),
    closing: last?.balance ?? null, balanceDate: last?.date ?? null,
  };
}
export function monthlySavings(ledger: Ledger) {
  return monthsBetween(ledger.rows[0].date, ledger.rows[ledger.rows.length - 1].date).map((month) => ({ month, ...savingsPeriod(ledger, month) }));
}
export function ledgerStatus(ledger: Ledger): "review" | "partial" | "matches" | "unavailable" {
  if (!ledger.balanceCount) return "unavailable";
  if ((ledger.difference !== null && ledger.difference !== 0) || ledger.issues.some((issue) => issue.kind === "balance" || issue.kind === "duplicate")) return "review";
  if (ledger.balanceCount < ledger.rows.length || ledger.issues.length || ledger.difference !== 0 || ledger.rows.length < 2) return "partial";
  return "matches";
}
