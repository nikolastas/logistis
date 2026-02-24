import type { MigrationInterface, QueryRunner } from "typeorm";

export class PerkCardEntity1740400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "perk_cards" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "monthlyValue" decimal(10,2) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_perk_cards" PRIMARY KEY ("id"),
        CONSTRAINT "FK_perk_cards_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "perk_card_categories" (
        "perkCardId" uuid NOT NULL,
        "categoryId" varchar NOT NULL,
        CONSTRAINT "PK_perk_card_categories" PRIMARY KEY ("perkCardId", "categoryId"),
        CONSTRAINT "FK_perk_card_categories_perk" FOREIGN KEY ("perkCardId") REFERENCES "perk_cards"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_perk_card_categories_category" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "income_perk_cards" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "incomeId" uuid NOT NULL,
        "perkCardId" uuid NOT NULL,
        "monthlyValue" decimal(10,2),
        CONSTRAINT "PK_income_perk_cards" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_income_perk" UNIQUE ("incomeId", "perkCardId"),
        CONSTRAINT "FK_income_perk_cards_income" FOREIGN KEY ("incomeId") REFERENCES "income"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_income_perk_cards_perk" FOREIGN KEY ("perkCardId") REFERENCES "perk_cards"("id") ON DELETE CASCADE
      )
    `);

    const hasPerkCards = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'income' AND column_name = 'perkCards'
    `);
    if (Array.isArray(hasPerkCards) && hasPerkCards.length > 0) {
      const incomes = await queryRunner.query(
        `SELECT id, "userId", "perkCards" FROM "income" WHERE "perkCards" IS NOT NULL AND "perkCards" != 'null'::jsonb AND jsonb_array_length("perkCards") > 0`
      ) as Array<{ id: string; userId: string; perkCards: unknown }>;

      const perkByUserAndName = new Map<string, string>();

      for (const inc of incomes) {
        let arr = inc.perkCards;
        if (typeof arr === "string") arr = JSON.parse(arr) as unknown[];
        if (!Array.isArray(arr)) continue;

        for (const p of arr) {
          if (!p || typeof p !== "object") continue;
          const name = (p as { name?: unknown }).name;
          const monthlyValue = (p as { monthlyValue?: unknown }).monthlyValue;
          const categoryId = (p as { categoryId?: unknown }).categoryId;
          if (typeof name !== "string" || !name.trim()) continue;
          const val = typeof monthlyValue === "number" ? monthlyValue : 0;
          const catId = typeof categoryId === "string" ? categoryId.trim() : null;

          const key = `${inc.userId}::${name.trim()}`;
          let perkCardId = perkByUserAndName.get(key);
          if (!perkCardId) {
            const rows = await queryRunner.query(
              `INSERT INTO "perk_cards" ("userId", "name", "monthlyValue") VALUES ($1, $2, $3) RETURNING id`,
              [inc.userId, name.trim(), String(val)]
            ) as Array<{ id: string }>;
            perkCardId = rows[0]?.id;
            if (!perkCardId) continue;
            perkByUserAndName.set(key, perkCardId);
          }

          if (catId) {
            await queryRunner.query(
              `INSERT INTO "perk_card_categories" ("perkCardId", "categoryId") VALUES ($1, $2) ON CONFLICT ("perkCardId", "categoryId") DO NOTHING`,
              [perkCardId, catId]
            );
          }

          await queryRunner.query(
            `INSERT INTO "income_perk_cards" ("incomeId", "perkCardId", "monthlyValue") VALUES ($1, $2, $3) ON CONFLICT ("incomeId", "perkCardId") DO NOTHING`,
            [inc.id, perkCardId, String(val)]
          );
        }
      }
    }

    await queryRunner.query(`
      ALTER TABLE "income" DROP COLUMN IF EXISTS "perkCards"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "income" ADD COLUMN IF NOT EXISTS "perkCards" jsonb
    `);

    const links = await queryRunner.query(`
      SELECT ipc."incomeId", ipc."perkCardId", ipc."monthlyValue", pc."name", pc."userId"
      FROM "income_perk_cards" ipc
      JOIN "perk_cards" pc ON pc.id = ipc."perkCardId"
    `) as Array<{ incomeId: string; perkCardId: string; monthlyValue: string | null; name: string; userId: string }>;

    const catsByPerk = new Map<string, string[]>();
    const catLinks = await queryRunner.query(
      `SELECT "perkCardId", "categoryId" FROM "perk_card_categories"`
    ) as Array<{ perkCardId: string; categoryId: string }>;
    for (const c of catLinks) {
      const arr = catsByPerk.get(c.perkCardId) ?? [];
      arr.push(c.categoryId);
      catsByPerk.set(c.perkCardId, arr);
    }

    const byIncome = new Map<string, Array<{ name: string; monthlyValue: number; categoryId: string }>>();
    for (const l of links) {
      const cats = catsByPerk.get(l.perkCardId) ?? [];
      const categoryId = cats[0] ?? "food";
      const val = l.monthlyValue != null ? parseFloat(l.monthlyValue) : 0;
      const arr = byIncome.get(l.incomeId) ?? [];
      arr.push({ name: l.name, monthlyValue: val, categoryId });
      byIncome.set(l.incomeId, arr);
    }
    for (const [incomeId, perkCards] of byIncome) {
      await queryRunner.query(
        `UPDATE "income" SET "perkCards" = $1::jsonb WHERE id = $2`,
        [JSON.stringify(perkCards), incomeId]
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "income_perk_cards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "perk_card_categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "perk_cards"`);
  }
}
