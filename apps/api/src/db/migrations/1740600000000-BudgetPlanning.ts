import type { MigrationInterface, QueryRunner } from "typeorm";

export class BudgetPlanning1740600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "households"
      ADD COLUMN IF NOT EXISTS "defaultSavingsTarget" decimal(12,2)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "budget_plans" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "householdId" uuid NOT NULL,
        "month" varchar(7) NOT NULL,
        "savingsTarget" decimal(12,2),
        "status" varchar(20) NOT NULL DEFAULT 'draft',
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_budget_plans" PRIMARY KEY ("id"),
        CONSTRAINT "FK_budget_plans_household" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_budget_plan_household_month" UNIQUE ("householdId", "month")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "budget_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "budgetPlanId" uuid NOT NULL,
        "userId" uuid,
        "name" varchar(255) NOT NULL,
        "amount" decimal(12,2) NOT NULL,
        "type" varchar(20) NOT NULL,
        "categoryId" varchar(50) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_budget_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_budget_items_plan" FOREIGN KEY ("budgetPlanId") REFERENCES "budget_plans"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_budget_items_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_budget_items_category" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "budget_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "budget_plans"`);
    await queryRunner.query(`
      ALTER TABLE "households"
      DROP COLUMN IF EXISTS "defaultSavingsTarget"
    `);
  }
}
