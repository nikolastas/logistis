import type { BankParser } from "./base";
import { alphaBankParser } from "./alphaBank";
import { nbgParser } from "./nbg";
import { nbgXlsxParser } from "./nbgXlsx";
import { winbankParser } from "./winbank";
import { revolutParser } from "./revolut";
import { genericPdfParser } from "./genericPdf";
import { payzyParser } from "./payzy";

const csvParsers: BankParser[] = [
  alphaBankParser,
  nbgParser,
  winbankParser,
  revolutParser,
];

export type BankId =
  | "alpha-bank"
  | "nbg"
  | "nbg-xlsx"
  | "winbank"
  | "revolut"
  | "generic-pdf"
  | "payzy"
  | "auto";

export function getParser(bank: BankId): BankParser {
  if (bank === "generic-pdf") return genericPdfParser;
  if (bank === "payzy") return payzyParser;
  if (bank === "nbg-xlsx") return nbgXlsxParser;
  if (bank === "auto") return csvParsers[0];
  const p = csvParsers.find((x) => x.name === bank);
  if (!p) throw new Error(`Unknown bank: ${bank}`);
  return p;
}

export function detectBank(buffer: Buffer): BankId {
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return "generic-pdf";
  }
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return "nbg-xlsx";
  }
  const text = buffer.toString("utf-8", 0, Math.min(buffer.length, 4096));
  for (const p of csvParsers) {
    if (p.detect?.(text)) return p.name as BankId;
  }
  return "alpha-bank";
}

export {
  alphaBankParser,
  nbgParser,
  nbgXlsxParser,
  winbankParser,
  revolutParser,
  genericPdfParser,
  payzyParser,
};
export type { BankParser } from "./base";
