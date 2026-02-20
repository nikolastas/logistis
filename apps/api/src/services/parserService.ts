import type { ParsedTransaction } from "@couple-finance/shared";
import { getParser, detectBank, type BankId } from "../parsers";
import { categorize } from "../categorizer";
import {
  classifyTransfer,
  isRevolutOwnAccountTransfer,
  type TransferClassification,
} from "./transferDetectionService";
import type { User } from "../entities/User";

export interface ProcessedTransaction extends ParsedTransaction {
  categoryId: string;
  transferType?: TransferClassification["transferType"] | null;
  transferCounterparty?: string | null;
  transferCounterpartyUserId?: string | null;
  isExcludedFromAnalytics?: boolean;
}

export interface ParseFileContext {
  householdId?: string | null;
  users?: User[];
}

export async function parseFile(
  buffer: Buffer,
  bank: BankId,
  mimeType?: string,
  context?: ParseFileContext
): Promise<{ transactions: ProcessedTransaction[]; bankSource: string }> {
  const isPdf =
    mimeType === "application/pdf" ||
    (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46);

  const isXlsx =
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    (buffer[0] === 0x50 && buffer[1] === 0x4b);

  const parser = isPdf
    ? getParser("generic-pdf")
    : isXlsx
      ? getParser(bank === "auto" ? "nbg-xlsx" : bank === "nbg" ? "nbg-xlsx" : bank)
      : getParser(bank === "auto" ? detectBank(buffer) : bank);
  const parsed = await parser.parse(buffer);

  const users = context?.users ?? [];
  const transactions: ProcessedTransaction[] = [];

  for (const p of parsed) {
    let transfer: TransferClassification | null = null;

    if (isRevolutOwnAccountTransfer(p.rawData) || p.transferHint === "own_account") {
      transfer = {
        transferType: "own_account",
        transferCounterparty: null,
        transferCounterpartyUserId: null,
        isExcludedFromAnalytics: true,
        categoryId: "transfer/own-account",
      };
    }

    if (!transfer) {
      transfer = classifyTransfer(p.description, p.amount, users, p.rawData);
    }

    let categoryId: string;
    if (transfer.transferType !== "none" && transfer.categoryId) {
      categoryId = transfer.categoryId;
    } else {
      categoryId = await categorize(p.description);
    }

    transactions.push({
      ...p,
      categoryId,
      transferType: transfer.transferType,
      transferCounterparty: transfer.transferCounterparty ?? null,
      transferCounterpartyUserId: transfer.transferCounterpartyUserId ?? null,
      isExcludedFromAnalytics: transfer.isExcludedFromAnalytics ?? false,
    });
  }

  return { transactions, bankSource: parser.name };
}
