import { parse } from "csv-parse/sync";
import type { BankParser, ParsedTransaction } from "./base";

function parseDate(val: string): string {
  const m = val.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) {
    const iso = val.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return val;
    return val;
  }
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseAmount(debit: string, credit: string): number {
  const d = parseFloat((debit || "0").replace(",", ".").replace(/\s/g, ""));
  const c = parseFloat((credit || "0").replace(",", ".").replace(/\s/g, ""));
  if (d > 0) return -d;
  return c;
}

export const nbgParser: BankParser = {
  name: "nbg",
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    const text = buffer.toString("utf-8");
    const rows = parse(text, {
      delimiter: "\t",
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];

    const out: ParsedTransaction[] = [];
    const header = rows[0]?.map((h) => (h || "").toLowerCase()) || [];
    const dateIdx = header.findIndex((h) => h.includes("date") || h.includes("ημερομηνία"));
    const descIdx = header.findIndex((h) => h.includes("description") || h.includes("περιγραφή"));
    const debitIdx = header.findIndex((h) => h.includes("debit") || h.includes("χρέωση"));
    const creditIdx = header.findIndex((h) => h.includes("credit") || h.includes("πίστωση"));
    const refIdx = header.findIndex((h) => h.includes("reference") || h.includes("αριθμός αναφοράς") || h.includes("α/α"));

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;
      const date = dateIdx >= 0 ? row[dateIdx] || "" : row[0];
      const desc = descIdx >= 0 ? row[descIdx] || "" : row[1];
      const debit = debitIdx >= 0 ? row[debitIdx] || "" : row[2] || "";
      const credit = creditIdx >= 0 ? row[creditIdx] || "" : row[3] || "";
      const amount = parseAmount(debit, credit);
      if (!date || !desc) continue;
      const bankReference = refIdx >= 0 && row[refIdx] ? String(row[refIdx]).trim() : undefined;
      out.push({
        date: parseDate(date),
        description: String(desc).trim(),
        amount,
        bankReference,
        rawData: { row },
      });
    }
    return out;
  },
  detect(content: string): boolean {
    return (
      content.includes("NBG") ||
      (content.includes("\t") && (content.includes("debit") || content.includes("credit")))
    );
  },
};
