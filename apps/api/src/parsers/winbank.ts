import iconv from "iconv-lite";
import type { BankParser, ParsedTransaction } from "./base";

function parseEuroAmount(val: string): number {
  if (!val || val.trim() === "") return 0;
  const cleaned = val
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  return parseFloat(cleaned) || 0;
}

/** Matches bank transaction IDs: PO..., AT..., EB..., F... (1–3 letter prefix + alphanumeric) */
const BANK_TX_ID = /^[A-Z]{1,3}[A-Z0-9]{8,}$/;

/** Category IDs from categories.json – ATM → cash; F26TI → incoming; F928TO → outgoing; EB → by amount */
const CATEGORY_CASH = "cash";
const CATEGORY_TRANSFER_FROM = "transfer/from-third-party";
const CATEGORY_TRANSFER_TO = "transfer/to-third-party";

function winbankCategoryFromRef(
  bankRef: string | undefined,
  amount: number
): string | undefined {
  if (!bankRef) return undefined;
  const ref = bankRef.toUpperCase();
  if (ref.startsWith("AT")) return CATEGORY_CASH;
  if (ref.startsWith("PO")) return undefined;
  if (ref.startsWith("F26TI")) return CATEGORY_TRANSFER_FROM;
  if (ref.startsWith("F928TO")) return CATEGORY_TRANSFER_TO;
  if (ref.startsWith("EB")) return amount >= 0 ? CATEGORY_TRANSFER_FROM : CATEGORY_TRANSFER_TO;
  return undefined;
}

interface RawTransaction {
  date: string;
  type: string;
  valueDate: string;
  credit: number;
  debit: number;
  balance: number;
  details: string[];
  refs: string[];
}

function buildTransaction(tx: RawTransaction): ParsedTransaction {
  const amount = tx.credit !== 0 ? tx.credit : tx.debit;
  const description = tx.details[0] || tx.type;

  const isOwnAccountTransfer =
    tx.debit < 0 && tx.details.some((d) => /revolut/i.test(d));

  const bankTxId = tx.refs.find((r) => BANK_TX_ID.test(r));
  const bankReference = bankTxId ?? tx.refs[tx.refs.length - 1];
  const winbankCategoryId = winbankCategoryFromRef(bankReference || undefined, amount);

  return {
    date: tx.date,
    description,
    amount,
    bankReference: bankReference || undefined,
    rawData: {
      type: tx.type,
      details: tx.details,
      balance: tx.balance,
      valueDate: tx.valueDate,
      refs: tx.refs,
      ...(winbankCategoryId && { winbankCategoryId }),
    },
    ...(isOwnAccountTransfer ? { transferHint: "own_account" as const } : {}),
  };
}

export const winbankParser: BankParser = {
  name: "winbank",
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    const text = iconv.decode(buffer, "win1253");
    const lines = text.split(/\r?\n/);

    let headerIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 25); i++) {
      if (
        lines[i].includes("Ημ/νία") ||
        lines[i].includes("Αιτιολογία")
      ) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) return [];

    const out: ParsedTransaction[] = [];
    let current: RawTransaction | null = null;

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
      if (
        line.includes("Opening Balance") ||
        line.includes("Closing Balance")
      )
        continue;
      if (line.includes("Ταχυδρομική") || line.includes("ΤΗΛ.:")) continue;

      const cols = line.split(";");
      const firstCol = cols[0]?.trim() || "";

      if (/^\d{4}-\d{2}-\d{2}$/.test(firstCol)) {
        if (current) out.push(buildTransaction(current));
        current = {
          date: firstCol,
          type: cols[1]?.trim() || "",
          valueDate: cols[2]?.trim() || "",
          credit: parseEuroAmount(cols[3] || ""),
          debit: parseEuroAmount(cols[4] || ""),
          balance: parseEuroAmount(cols[5] || ""),
          details: [],
          refs: [],
        };
      } else if (current && firstCol === "") {
        const detail = cols[1]?.trim() || "";
        if (!detail) continue;
        const m = detail.match(/^="(.+)"$/);
        if (m) {
          current.details.push(m[1]);
        } else {
          current.refs.push(detail);
        }
      }
    }
    if (current) out.push(buildTransaction(current));

    return out;
  },

  detect(content: string): boolean {
    return (
      content.includes("PIRBGRAA") || content.includes("piraeusbank")
    );
  },
};
