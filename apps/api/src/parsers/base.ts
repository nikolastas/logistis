import type { ParsedTransaction } from "@couple-finance/shared";

export interface BankParser {
  name: string;
  parse(buffer: Buffer): Promise<ParsedTransaction[]>;
  detect?(content: string): boolean;
}

export type { ParsedTransaction };
