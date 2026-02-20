import type { MigrationInterface } from "typeorm";

export class AddHouseholdUserIncome1739900000000 implements MigrationInterface {
  public async up(queryRunner: { query: (sql: string) => Promise<void> }): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "households" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_households" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "householdId" uuid NOT NULL,
        "nickname" varchar(100) NOT NULL,
        "legalNameEl" varchar(255) NOT NULL,
        "legalNameEn" varchar(255) NOT NULL,
        "color" varchar(20) NOT NULL DEFAULT '#6366f1',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "FK_users_household" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "income" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "householdId" uuid NOT NULL,
        "netMonthlySalary" decimal(10,2) NOT NULL,
        "grossMonthlySalary" decimal(10,2),
        "effectiveFrom" date NOT NULL,
        "effectiveTo" date,
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_income" PRIMARY KEY ("id"),
        CONSTRAINT "FK_income_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_income_household" FOREIGN KEY ("householdId") REFERENCES "households"("id")
      )
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'householdId'
        ) THEN
          ALTER TABLE "transactions" ADD COLUMN "householdId" uuid;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'ownerId'
        ) THEN
          ALTER TABLE "transactions" ADD COLUMN "ownerId" uuid;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'orphaned'
        ) THEN
          ALTER TABLE "transactions" ADD COLUMN "orphaned" boolean NOT NULL DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'income' AND column_name = 'perkCards'
        ) THEN
          ALTER TABLE "income" ADD COLUMN "perkCards" jsonb;
        END IF;
      END $$
    `);
  }

  public async down(): Promise<void> {
    // Optional: implement rollback if needed
  }
}
