import type { MigrationInterface } from "typeorm";

export class AddHouseholdDefaultSplit1740000000000 implements MigrationInterface {
  public async up(queryRunner: { query: (sql: string) => Promise<void> }): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "defaultSplit" jsonb
    `);
  }

  public async down(): Promise<void> {
    // Optional: implement rollback if needed
  }
}
