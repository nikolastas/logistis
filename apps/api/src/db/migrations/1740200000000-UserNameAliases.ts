import type { MigrationInterface } from "typeorm";

export class UserNameAliases1740200000000 implements MigrationInterface {
  public async up(queryRunner: { query: (sql: string) => Promise<void> }): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nameAliases" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      DO $mig$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'legalNameEl') THEN
          EXECUTE $inner$
            UPDATE "users" SET "nameAliases" = CASE
              WHEN trim(COALESCE("legalNameEl",'')) != '' AND trim(COALESCE("legalNameEn",'')) != '' AND trim("legalNameEl") != trim("legalNameEn")
              THEN jsonb_build_array(trim("legalNameEl"), trim("legalNameEn"))
              WHEN trim(COALESCE("legalNameEl",'')) != ''
              THEN jsonb_build_array(trim("legalNameEl"))
              WHEN trim(COALESCE("legalNameEn",'')) != ''
              THEN jsonb_build_array(trim("legalNameEn"))
              ELSE '[]'::jsonb
            END
          $inner$;
          ALTER TABLE "users" DROP COLUMN IF EXISTS "legalNameEl";
          ALTER TABLE "users" DROP COLUMN IF EXISTS "legalNameEn";
        END IF;
      END $mig$
    `);
  }

  public async down(queryRunner: { query: (sql: string) => Promise<void> }): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "legalNameEl" varchar(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "legalNameEn" varchar(255)
    `);
    await queryRunner.query(`
      UPDATE "users" SET "legalNameEl" = COALESCE("nameAliases"->>0, ''), "legalNameEn" = COALESCE("nameAliases"->>1, "nameAliases"->>0, '')
      WHERE jsonb_array_length("nameAliases") > 0
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "nameAliases"
    `);
  }
}
