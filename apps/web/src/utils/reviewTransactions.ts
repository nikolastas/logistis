import type { Transaction } from "../api/transactions";

export type TransactionSort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc" | "merchant";
export type MerchantSort = "out-desc" | "out-asc" | "in-desc" | "count-desc" | "merchant" | "date-desc";

export interface MerchantGroup {
  key: string;
  name: string;
  transactions: Transaction[];
  moneyOutCents: number;
  moneyInCents: number;
  netCents: number;
  firstDate: string;
  lastDate: string;
  categoryId: string | null;
  bankSources: string[];
}

function cleanName(value: string): string {
  return value.replace(/^CARD[ _]PAYMENT\s+/i, "").replace(/\s+/g, " ").trim();
}

export function getMerchantName(transaction: Transaction): string {
  if (transaction.bankSource === "nbg-xlsx") {
    const raw = transaction.rawData?.row;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const description = (raw as Record<string, unknown>)["Περιγραφή"];
      if (typeof description === "string" && description.trim()) return cleanName(description);
    }
    const parts = transaction.description.split(/\s+-\s+/);
    if (/^\d{3}\s/.test(parts[0]) && parts.length >= 3 && parts[1].trim()) return cleanName(parts[1]);
  }
  return cleanName(transaction.description) || "Unknown merchant";
}

function merchantKey(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el").replace(/ς/g, "σ").replace(/[^\p{L}\p{N}]/gu, "");
}

function cents(transaction: Transaction): number {
  const amount = Number(transaction.amount);
  if (!Number.isFinite(amount)) throw new Error("Invalid transaction amount");
  return Math.round(amount * 100);
}

export function groupTransactionsByMerchant(transactions: readonly Transaction[]): MerchantGroup[] {
  const groups = new Map<string, MerchantGroup>();
  for (const transaction of transactions) {
    const name = getMerchantName(transaction);
    const key = merchantKey(name) || name;
    let group = groups.get(key);
    if (!group) {
      group = {
        key, name, transactions: [], moneyOutCents: 0, moneyInCents: 0, netCents: 0,
        firstDate: transaction.date, lastDate: transaction.date,
        categoryId: transaction.categoryId, bankSources: [],
      };
      groups.set(key, group);
    }
    if (name.length < group.name.length) group.name = name;
    group.transactions.push(transaction);
    const amount = cents(transaction);
    if (amount < 0) group.moneyOutCents += -amount;
    else group.moneyInCents += amount;
    group.netCents += amount;
    if (transaction.date < group.firstDate) group.firstDate = transaction.date;
    if (transaction.date > group.lastDate) group.lastDate = transaction.date;
    if (transaction.categoryId !== group.categoryId) group.categoryId = null;
    if (!group.bankSources.includes(transaction.bankSource)) group.bankSources.push(transaction.bankSource);
  }
  return [...groups.values()];
}

export function sortTransactions(transactions: readonly Transaction[], sort: TransactionSort): Transaction[] {
  return [...transactions].sort((a, b) => {
    let comparison = 0;
    switch (sort) {
      case "date-desc": comparison = b.date.localeCompare(a.date); break;
      case "date-asc": comparison = a.date.localeCompare(b.date); break;
      case "amount-desc": comparison = Math.abs(cents(b)) - Math.abs(cents(a)); break;
      case "amount-asc": comparison = Math.abs(cents(a)) - Math.abs(cents(b)); break;
      case "merchant": comparison = getMerchantName(a).localeCompare(getMerchantName(b), "el"); break;
    }
    return comparison || b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
  });
}

export function sortMerchantGroups(groups: readonly MerchantGroup[], sort: MerchantSort): MerchantGroup[] {
  return [...groups].sort((a, b) => {
    let comparison = 0;
    switch (sort) {
      case "out-desc": comparison = b.moneyOutCents - a.moneyOutCents; break;
      case "out-asc": comparison = a.moneyOutCents - b.moneyOutCents; break;
      case "in-desc": comparison = b.moneyInCents - a.moneyInCents; break;
      case "count-desc": comparison = b.transactions.length - a.transactions.length; break;
      case "merchant": comparison = a.name.localeCompare(b.name, "el"); break;
      case "date-desc": comparison = b.lastDate.localeCompare(a.lastDate); break;
    }
    return comparison || a.name.localeCompare(b.name, "el") || a.key.localeCompare(b.key);
  });
}

export function selectionState(selected: ReadonlySet<string>, ids: readonly string[]) {
  const count = ids.filter((id) => selected.has(id)).length;
  return { checked: ids.length > 0 && count === ids.length, indeterminate: count > 0 && count < ids.length };
}

export function toggleTransactionSelection(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(selected);
  const clear = ids.length > 0 && ids.every((id) => selected.has(id));
  for (const id of ids) {
    if (clear) next.delete(id);
    else next.add(id);
  }
  return next;
}
