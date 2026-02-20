import type { BankParser, ParsedTransaction } from "./base";

// pdf-parse default export: (buffer) => Promise<{ text: string, ... }>
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");

/**
 * Generic PDF parser that extracts text and parses common bank statement patterns.
 * Looks for: date (DD/MM/YYYY or YYYY-MM-DD), description, amount (with optional +/-)
 */
export const genericPdfParser: BankParser = {
  name: "generic-pdf",
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    const result = await pdfParse(buffer);
    const text = (result?.text || "") as string;
    return parseStatementText(text);
  },
};

function parseStatementText(text: string): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];
  const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

  // Common patterns: date, optional ref, description, amount
  // Date: DD/MM/YYYY or YYYY-MM-DD
  const dateRe = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/;
  // Amount: 1,234.56 or 1234,56 or -123.45 or (123.45)
  const amountRe = /([-+]?\s*[\d.,]+(?:\s*[€$]?)|\(\s*[\d.,]+\s*\))/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(dateRe);
    const amountMatch = line.match(amountRe);

    if (!dateMatch && !amountMatch) continue;

    let date = "";
    let desc = line;
    let amount = 0;

    if (dateMatch) {
      date = normalizeDate(dateMatch[1]);
      desc = line.replace(dateMatch[0], "").trim();
    }
    if (amountMatch) {
      const raw = amountMatch[1].replace(/[€$\s]/g, "").replace(",", ".");
      const neg = raw.startsWith("-") || raw.startsWith("(");
      amount = parseFloat(raw.replace(/[()]/g, "")) || 0;
      if (neg) amount = -Math.abs(amount);
      desc = desc.replace(amountMatch[0], "").trim();
    }

    if (date && desc && (amount !== 0 || desc.length > 3)) {
      out.push({ date, description: desc || "Unknown", amount, rawData: { line } });
    }
  }

  return out;
}

function normalizeDate(s: string): string {
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const m2 = s.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  if (m2) return m2[0];
  return s;
}
