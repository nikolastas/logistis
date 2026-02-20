import type { MigrationInterface } from "typeorm";

export class AddTransferColumns1740100000000 implements MigrationInterface {
  public async up(queryRunner: { query: (sql: string) => Promise<void> }): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'transferType'
        ) THEN
          ALTER TABLE "transactions" ADD COLUMN "transferType" varchar(20);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'linkedTransactionId'
        ) THEN
          ALTER TABLE "transactions" ADD COLUMN "linkedTransactionId" uuid;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'transferCounterparty'
        ) THEN
          ALTER TABLE "transactions" ADD COLUMN "transferCounterparty" varchar(255);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'transferCounterpartyUserId'
        ) THEN
          ALTER TABLE "transactions" ADD COLUMN "transferCounterpartyUserId" uuid;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'isExcludedFromAnalytics'
        ) THEN
          ALTER TABLE "transactions" ADD COLUMN "isExcludedFromAnalytics" boolean NOT NULL DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'countAsExpense'
        ) THEN
          ALTER TABLE "transactions" ADD COLUMN "countAsExpense" boolean NOT NULL DEFAULT false;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_transactions_linked'
        ) THEN
          ALTER TABLE "transactions"
          ADD CONSTRAINT "FK_transactions_linked"
          FOREIGN KEY ("linkedTransactionId") REFERENCES "transactions"("id");
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_transactions_counterparty_user'
        ) THEN
          ALTER TABLE "transactions"
          ADD CONSTRAINT "FK_transactions_counterparty_user"
          FOREIGN KEY ("transferCounterpartyUserId") REFERENCES "users"("id");
        END IF;
      END $$
    `);
  }

  public async down(): Promise<void> {
    // Optional: implement rollback if needed
  }
}
