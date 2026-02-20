import { parse } from "csv-parse/sync";
import type { BankParser, ParsedTransaction } from "./base";

function parseDate(val: string): string {
  const iso = val.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const m = val.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return val;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export const revolutParser: BankParser = {
  name: "revolut",
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
    const dateIdx = header.findIndex((h) => h.includes("date") || h.includes("started"));
    const descIdx = header.findIndex(
      (h) => h.includes("description") || h.includes("reference") || h.includes("product")
    );
    const amountIdx = header.findIndex(
      (h) => h.includes("amount") || h.includes("completed") || h.includes("fee")
    );
    const refIdx = header.findIndex((h) => h.includes("reference") || h === "id" || h.includes("transaction"));
    const typeIdx = header.findIndex((h) => h === "type");

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;
      const date = dateIdx >= 0 ? row[dateIdx] || "" : row[0];
      const desc = descIdx >= 0 ? row[descIdx] || "" : row[1];
      let amount = 0;
      if (amountIdx >= 0) {
        amount = parseFloat(
          String(row[amountIdx] || "0")
            .replace(",", ".")
            .replace(/\s/g, "")
        ) || 0;
      } else {
        for (let j = 2; j < row.length; j++) {
          const v = parseFloat(String(row[j] || "0").replace(",", "."));
          if (!isNaN(v) && v !== 0) {
            amount = v;
            break;
          }
        }
      }
      if (!date || !desc) continue;
      const bankReference = refIdx >= 0 && row[refIdx] ? String(row[refIdx]).trim() : undefined;
      const txType = typeIdx >= 0 && row[typeIdx] ? String(row[typeIdx]).trim().toUpperCase() : "";
      const rawData: Record<string, unknown> = { row };
      if (txType) rawData.Type = txType;

      const isTransfer = txType === "TRANSFER";
      out.push({
        date: parseDate(date),
        description: String(desc).trim(),
        amount,
        bankReference,
        rawData,
        ...(isTransfer && { transferHint: "own_account" as const }),
      });
    }
    return out;
  },
  detect(content: string): boolean {
    return (
      content.includes("Revolut") ||
      (content.includes("Type") && content.includes("Completed") && content.includes(","))
    );
  },
};
