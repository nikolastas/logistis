import * as XLSX from "xlsx";
import type { BankParser, ParsedTransaction } from "./base";

/**
 * NBG bank statement XLSX format.
 * Columns (Greek): Α/Α Συναλλαγής, Ημερομηνία, Ώρα, Valeur, Κατάστημα, Κατηγορία συναλλαγής,
 * Είδος εργασίας, Ποσό συναλλαγής, Ποσό εντολής, Νόμισμα, Χρέωση / Πίστωση, Ισοτιμία,
 * Περιγραφή, Λογιστικό Υπόλοιπο, Ονοματεπώνυμο αντισυμβαλλόμενου, Λογαριασμός αντισυμβαλλόμενου, ...
 */
const COLUMNS = {
  date: "Ημερομηνία",
  time: "Ώρα",
  valeur: "Valeur",
  merchant: "Κατάστημα",
  category: "Κατηγορία συναλλαγής",
  amount: "Ποσό συναλλαγής",
  debitCredit: "Χρέωση / Πίστωση",
  description: "Περιγραφή",
  balance: "Λογιστικό Υπόλοιπο",
  reference: "Αριθμός αναφοράς",
  transactionNo: "Α/Α Συναλλαγής",
  /** Counterparty account (IBAN) – presence indicates a transfer */
  counterpartyAccount: "Λογαριασμός αντισυμβαλλόμενου",
  /** Counterparty name – for household member matching */
  counterpartyName: "Ονοματεπώνυμο αντισυμβαλλόμενου",
};

function parseDate(val: unknown): string {
  if (!val) return "";
  const s = String(val).trim();
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  if (typeof val === "number" && val > 0) {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return s;
}

function parseAmount(
  amountVal: unknown,
  debitCreditVal: unknown
): number {
  const amount = parseFloat(
    String(amountVal || "0")
      .replace(",", ".")
      .replace(/\s/g, "")
      .replace(/[^\d.-]/g, "")
  ) || 0;
  if (amount < 0) return amount;
  const dc = String(debitCreditVal || "").toLowerCase().trim();
  const isDebit = dc.includes("Χ") || dc.includes("χ") || dc === "d";
  return isDebit ? -Math.abs(amount) : Math.abs(amount);
}

function buildDescription(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const merchant = row[COLUMNS.merchant];
  const desc = row[COLUMNS.description];
  const category = row[COLUMNS.category];
  const counterpartyName = row[COLUMNS.counterpartyName];
  if (merchant) parts.push(String(merchant).trim());
  if (desc) parts.push(String(desc).trim());
  if (category) parts.push(String(category).trim());
  if (counterpartyName) parts.push(String(counterpartyName).trim());
  return parts.filter(Boolean).join(" - ") || "Unknown";
}

export const nbgXlsxParser: BankParser = {
  name: "nbg-xlsx",
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames.find((n) => n.toLowerCase() === "data") || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });

    const out: ParsedTransaction[] = [];
    for (const row of rows) {
      const dateVal = row[COLUMNS.date];
      const amountVal = row[COLUMNS.amount];
      const debitCreditVal = row[COLUMNS.debitCredit];

      if (!dateVal) continue;

      const date = parseDate(dateVal);
      const amount = parseAmount(amountVal, debitCreditVal);
      const description = buildDescription(row);

      if (!date) continue;

      const ref = row[COLUMNS.reference] ?? row[COLUMNS.transactionNo];
      const bankReference = ref ? String(ref).trim() : undefined;

      const counterpartyAccount = row[COLUMNS.counterpartyAccount];
      const counterpartyName = row[COLUMNS.counterpartyName];
      const hasCounterpartyAccount =
        counterpartyAccount != null && String(counterpartyAccount).trim().length > 0;

      out.push({
        date,
        description: description || "Unknown",
        amount,
        bankReference: bankReference || undefined,
        rawData: {
          row,
          counterpartyAccount: hasCounterpartyAccount ? String(counterpartyAccount).trim() : undefined,
          counterpartyName: counterpartyName ? String(counterpartyName).trim() : undefined,
        },
      });
    }
    return out;
  },
  detect(content: string): boolean {
    return false;
  },
};
