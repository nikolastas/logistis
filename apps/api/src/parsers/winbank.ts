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

export const winbankParser: BankParser = {
  name: "winbank",
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    const text = buffer.toString("utf-8");
    const rows = parse(text, {
      delimiter: ",",
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];

    const out: ParsedTransaction[] = [];
    const header = rows[0]?.map((h) => (h || "").toLowerCase()) || [];
    const dateIdx = header.findIndex((h) => h.includes("date") || h.includes("ημερομηνία"));
    const descIdx = header.findIndex((h) => h.includes("description") || h.includes("περιγραφή"));
    const amountIdx = header.findIndex(
      (h) => h.includes("amount") || h.includes("ποσό") || h.includes("value")
    );
    const refIdx = header.findIndex((h) => h.includes("reference") || h.includes("αριθμός") || h.includes("id"));

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;
      const date = dateIdx >= 0 ? row[dateIdx] || "" : row[0];
      const desc = descIdx >= 0 ? row[descIdx] || "" : row[1];
      const amountStr = amountIdx >= 0 ? row[amountIdx] || "" : row[2] || "0";
      const amount = parseFloat(
        String(amountStr)
          .replace(",", ".")
          .replace(/\s/g, "")
          .replace(/[^\d.-]/g, "")
      ) || 0;
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
      content.includes("Winbank") ||
      content.includes("Piraeus") ||
      (content.includes(",") && content.includes("amount"))
    );
  },
};
