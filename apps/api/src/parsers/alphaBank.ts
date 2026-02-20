import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import type { BankParser, ParsedTransaction } from "./base";

function parseDate(val: string): string {
  const m = val.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return val;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseAmount(debit: string, credit: string): number {
  const d = parseFloat((debit || "0").replace(",", ".").replace(/\s/g, ""));
  const c = parseFloat((credit || "0").replace(",", ".").replace(/\s/g, ""));
  if (d > 0) return -d;
  return c;
}

export const alphaBankParser: BankParser = {
  name: "alpha-bank",
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    const text = iconv.decode(buffer, "win1253");
    const rows = parse(text, {
      delimiter: ";",
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];

    const out: ParsedTransaction[] = [];
    const header = rows[0]?.map((h) => (h || "").toLowerCase()) || [];
    const dateIdx = header.findIndex((h) => h.includes("ημερομηνία") || h.includes("date"));
    const descIdx = header.findIndex((h) => h.includes("περιγραφή") || h.includes("description"));
    const debitIdx = header.findIndex((h) => h.includes("χρέωση") || h.includes("debit"));
    const creditIdx = header.findIndex((h) => h.includes("πίστωση") || h.includes("credit"));
    const refIdx = header.findIndex((h) => h.includes("αριθμός") || h.includes("reference") || h.includes("κωδικός"));

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
      content.includes("Alpha") ||
      (content.includes(";") && (content.includes("χρέωση") || content.includes("debit")))
    );
  },
};
