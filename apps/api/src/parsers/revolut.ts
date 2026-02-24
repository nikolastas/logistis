import { createHash } from "crypto";
import { parse } from "csv-parse/sync";
import type { BankParser, ParsedTransaction } from "./base";

const EXPECTED_HEADER = [
  "type",
  "product",
  "started date",
  "completed date",
  "description",
  "amount",
  "fee",
  "currency",
  "state",
  "balance",
];

const IDX = {
  type: 0,
  product: 1,
  startedDate: 2,
  completedDate: 3,
  description: 4,
  amount: 5,
  fee: 6,
  currency: 7,
  state: 8,
  balance: 9,
} as const;

function parseDate(val: string): string {
  const iso = val.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const m = val.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return val;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function isExplicitFormat(header: string[]): boolean {
  if (header.length < EXPECTED_HEADER.length) return false;
  for (let i = 0; i < EXPECTED_HEADER.length; i++) {
    if (header[i]?.toLowerCase().trim() !== EXPECTED_HEADER[i]) return false;
  }
  return true;
}

const POCKET_PATTERNS = [/to pocket/i, /αποταμίευση/i];

function isOwnAccountPocketTransfer(description: string): boolean {
  return POCKET_PATTERNS.some((re) => re.test(description));
}

/** Apple Pay deposit = top-up from user's own card into Revolut – own-account transfer */
function isOwnAccountDeposit(description: string): boolean {
  return /apple pay deposit/i.test(description);
}

const TRANSFER_COUNTERPARTY_RE = /^Transfer (?:to|from) (.+)$/i;

function extractTransferCounterparty(description: string): string | null {
  const m = description.match(TRANSFER_COUNTERPARTY_RE);
  if (!m) return null;
  let cp = m[1].trim();
  // Remove trailing " from EUR" etc.
  cp = cp.replace(/\s+from\s+[A-Z]{3}\s*$/i, "").trim();
  return cp.length >= 2 ? cp : null;
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
    const header = rows[0]?.map((h) => (h || "").toLowerCase().trim()) || [];
    const useExplicit = isExplicitFormat(header);

    const dateIdx = useExplicit
      ? -1
      : header.findIndex((h) => h.includes("date") || h.includes("started"));
    const descIdx = useExplicit
      ? -1
      : header.findIndex(
          (h) => h.includes("description") || h.includes("reference") || h.includes("product")
        );
    const amountIdx = useExplicit
      ? -1
      : header.findIndex((h) => h.includes("amount") && !h.includes("date"));
    const refIdx = header.findIndex(
      (h) => h.includes("reference") || h === "id" || h.includes("transaction")
    );
    const typeIdx = useExplicit ? -1 : header.findIndex((h) => h === "type");
    const stateIdx = useExplicit ? -1 : header.findIndex((h) => h === "state");

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      let date: string;
      let desc: string;
      let amount: number;
      let txType: string;
      let state: string;

      if (useExplicit) {
        const completedDate = row[IDX.completedDate]?.trim() || "";
        const startedDate = row[IDX.startedDate]?.trim() || "";
        date = completedDate || startedDate;
        desc = row[IDX.description]?.trim() || "";
        amount =
          parseFloat(
            String(row[IDX.amount] || "0")
              .replace(",", ".")
              .replace(/\s/g, "")
          ) || 0;
        txType = (row[IDX.type]?.trim() || "").toUpperCase();
        state = (row[IDX.state]?.trim() || "").toUpperCase();

        if (state === "PENDING") continue;
      } else {
        date = dateIdx >= 0 ? row[dateIdx] || "" : row[0];
        desc = descIdx >= 0 ? row[descIdx] || "" : row[1];
        if (amountIdx >= 0) {
          amount =
            parseFloat(
              String(row[amountIdx] || "0")
                .replace(",", ".")
                .replace(/\s/g, "")
            ) || 0;
        } else {
          amount = 0;
          for (let j = 2; j < row.length; j++) {
            const v = parseFloat(String(row[j] || "0").replace(",", "."));
            if (!isNaN(v) && v !== 0) {
              amount = v;
              break;
            }
          }
        }
        txType = typeIdx >= 0 ? (row[typeIdx] || "").trim().toUpperCase() : "";
        state = stateIdx >= 0 ? (row[stateIdx] || "").trim().toUpperCase() : "";
        if (stateIdx >= 0 && state === "PENDING") continue;
      }

      if (!date || !desc) continue;

      const bankReference =
        refIdx >= 0 && row[refIdx]
          ? String(row[refIdx]).trim()
          : createHash("sha256")
              .update(`${date}|${desc}|${amount}|${i}`)
              .digest("hex")
              .slice(0, 16);

      const rawData: Record<string, unknown> = { row };
      if (txType) rawData.Type = txType;
      if (useExplicit) {
        rawData.Product = row[IDX.product]?.trim();
        rawData.State = state;
        rawData.Description = desc;
      }

      let transferHint: "own_account" | undefined;
      if (txType === "TRANSFER") {
        if (isOwnAccountPocketTransfer(desc)) {
          transferHint = "own_account";
          rawData.isOwnAccountTransfer = true;
        } else {
          const counterparty = extractTransferCounterparty(desc);
          if (counterparty) rawData.transferCounterparty = counterparty;
        }
      } else if (txType === "DEPOSIT" && isOwnAccountDeposit(desc)) {
        transferHint = "own_account";
        rawData.isOwnAccountTransfer = true;
      }

      out.push({
        date: parseDate(date),
        description: String(desc).trim(),
        amount,
        bankReference,
        rawData,
        ...(transferHint && { transferHint }),
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
