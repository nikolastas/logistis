import { createHash } from "crypto";
import type { BankParser, ParsedTransaction } from "./base";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");

const PAYZY_OWN_ACCOUNT_MERCHANTS = ["PAYZY BY COSMOTE"];

function normalizeMerchantForTransferCheck(merchant: string): string {
  return merchant
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPayzyTopUpTransfer(merchant: string): boolean {
  const norm = normalizeMerchantForTransferCheck(merchant);
  return PAYZY_OWN_ACCOUNT_MERCHANTS.some((m) => norm.includes(normalizeMerchantForTransferCheck(m)));
}

function normalizeDate(s: string): string {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

// Card prefix: *** + 4 digits (e.g. ***2139). No space between merchant and Ολοκληρώθηκε.
const ROW_REGEX =
  /\*{3}\d{4}(.+?)Ολοκληρώθηκε\s*([-+]?[\d.,]+)\s*€?\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})/g;

export const payzyParser: BankParser = {
  name: "payzy",
  detect(content: string): boolean {
    return (
      content.includes("Υπηρεσίες Ηλεκτρονικού Χρήματος") ||
      content.includes("e-proof") ||
      (content.includes("Συναλλαγές") && content.includes("Όνομα εμπόρου"))
    );
  },
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    const result = await pdfParse(buffer);
    const text = (result?.text || "") as string;
    return parsePayzyStatement(text);
  },
};

function parsePayzyStatement(text: string): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = ROW_REGEX.exec(text)) !== null) {
    const merchant = match[1].trim();
    const amountStr = match[2].replace(",", ".");
    const dateStr = match[3];
    const timeStr = match[4];

    const amount = parseFloat(amountStr) || 0;
    const amountSigned = amountStr.startsWith("+") ? Math.abs(amount) : -Math.abs(amount);
    const date = normalizeDate(dateStr);

    const rawData: Record<string, unknown> = {
      merchant,
      status: "Ολοκληρώθηκε",
      dateStr,
      timeStr,
    };

    let transferHint: "own_account" | undefined;
    if (isPayzyTopUpTransfer(merchant)) {
      transferHint = "own_account";
      rawData.isOwnAccountTransfer = true;
    }

    const bankReference = createHash("sha256")
      .update(`${date}|${merchant}|${amountSigned}|${index}`)
      .digest("hex")
      .slice(0, 16);

    out.push({
      date,
      description: merchant,
      amount: amountSigned,
      bankReference,
      rawData,
      ...(transferHint && { transferHint }),
    });
    index++;
  }

  return out;
}
