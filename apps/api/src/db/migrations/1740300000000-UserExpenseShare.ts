import type { MigrationInterface, QueryRunner } from "typeorm";

export class UserExpenseShare1740300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "expenseShare" decimal(5,4)
    `);

    const hasDefaultSplit = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'households' AND column_name = 'defaultSplit'
    `);
    if (Array.isArray(hasDefaultSplit) && hasDefaultSplit.length > 0) {
      const households = await queryRunner.query(
        `SELECT id, "defaultSplit" FROM "households" WHERE "defaultSplit" IS NOT NULL AND "defaultSplit" != 'null'::jsonb`
      ) as Array<{ id: string; defaultSplit: unknown }>;
      for (const h of households) {
        let split = h.defaultSplit;
        if (typeof split === "string") split = JSON.parse(split) as Record<string, number>;
        if (!split || typeof split !== "object" || Array.isArray(split)) continue;
        const entries = Object.entries(split as Record<string, number>);
        for (const [userId, proportion] of entries) {
          if (typeof proportion === "number" && proportion >= 0 && proportion <= 1) {
            await queryRunner.query(
              `UPDATE "users" SET "expenseShare" = $1 WHERE id = $2 AND "householdId" = $3`,
              [String(proportion), userId, h.id]
            );
          }
        }
      }
    }

    await queryRunner.query(`
      ALTER TABLE "households" DROP COLUMN IF EXISTS "defaultSplit"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "defaultSplit" jsonb
    `);

    const users = await queryRunner.query(
      `SELECT id, "householdId", "expenseShare" FROM "users" WHERE "expenseShare" IS NOT NULL`
    );
    const byHousehold = new Map<string, Record<string, number>>();
    for (const u of users) {
      const share = parseFloat(u.expenseShare);
      if (isNaN(share) || share < 0 || share > 1) continue;
      const existing = byHousehold.get(u.householdId) ?? {};
      existing[u.id] = share;
      byHousehold.set(u.householdId, existing);
    }
    for (const [hid, split] of byHousehold) {
      const sum = Object.values(split).reduce((a, b) => a + b, 0);
      if (sum <= 0) continue;
      const normalized = Object.fromEntries(
        Object.entries(split).map(([k, v]) => [k, v / sum])
      );
      await queryRunner.query(
        `UPDATE "households" SET "defaultSplit" = $1::jsonb WHERE id = $2`,
        [JSON.stringify(normalized), hid]
      );
    }

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "expenseShare"
    `);
  }
}
