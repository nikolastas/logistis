import type { MigrationInterface, QueryRunner } from "typeorm";
import { aliasNormalize, matchUserByAlias } from "../../services/transferDetectionService";
import { User } from "../../entities/User";
import { Household } from "../../entities/Household";

export class TransactionRefactor1740500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Backfill third-party counterparties before dropping transferCounterparty (only if columns exist)
    const hasColumns = (await queryRunner.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'transactions' AND column_name = 'transferCounterparty'
      LIMIT 1
    `)) as unknown[];
    const hasTransferType = (await queryRunner.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'transactions' AND column_name = 'transferType'
      LIMIT 1
    `)) as unknown[];

    if (hasColumns.length > 0 && hasTransferType.length > 0) {
      const rows = (await queryRunner.query(`
        SELECT id, "householdId", amount, "transferCounterparty"
        FROM transactions
        WHERE "transferType" = 'third_party'
          AND "transferCounterparty" IS NOT NULL
          AND TRIM("transferCounterparty") != ''
          AND "transferCounterpartyUserId" IS NULL
      `)) as Array<{ id: string; householdId: string | null; amount: string; transferCounterparty: string }>;

      const uniqueCounterparties = new Set<string>();
      for (const r of rows) {
        if (r.transferCounterparty && r.transferCounterparty.trim().length >= 2) {
          uniqueCounterparties.add(r.transferCounterparty.trim());
        }
      }

      const userRepo = queryRunner.connection.getRepository(User);
      const householdRepo = queryRunner.connection.getRepository(Household);

      const allUsers = await userRepo.find();
      const counterpartyToUserId = new Map<string, string>();

      for (const cp of uniqueCounterparties) {
        const match = matchUserByAlias(cp, allUsers);
        if (match) {
          counterpartyToUserId.set(aliasNormalize(cp), match.userId);
        } else {
          const newHousehold = householdRepo.create({
            name: cp.length > 255 ? cp.slice(0, 252) + "..." : cp,
          });
          const savedHousehold = await householdRepo.save(newHousehold);
          const newUser = userRepo.create({
            householdId: savedHousehold.id,
            nickname: cp.length > 100 ? cp.slice(0, 97) + "..." : cp,
            nameAliases: [cp],
            color: "#6366f1",
          });
          const saved = await userRepo.save(newUser);
          allUsers.push(saved);
          counterpartyToUserId.set(aliasNormalize(cp), saved.id);
        }
      }

      for (const r of rows) {
        if (!r.transferCounterparty) continue;
        const cpNorm = aliasNormalize(r.transferCounterparty);
        const linkedUserId = counterpartyToUserId.get(cpNorm);
        if (linkedUserId) {
          const cpUser = allUsers.find((u) => u.id === linkedUserId);
          const sameHousehold = cpUser && r.householdId && cpUser.householdId === r.householdId;
          const amount = parseFloat(r.amount);
          const categoryId =
            amount < 0
              ? sameHousehold
                ? "transfer/to-household-member"
                : "transfer/to-external-member"
              : sameHousehold
                ? "transfer/from-household-member"
                : "transfer/from-external-member";
          await queryRunner.query(
            `UPDATE transactions SET "transferCounterpartyUserId" = $1, "categoryId" = $2 WHERE id = $3`,
            [linkedUserId, categoryId, r.id]
          );
        }
      }
    }

    // 2. Rename ownerId → userId
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'ownerId'
        ) THEN
          ALTER TABLE "transactions" RENAME COLUMN "ownerId" TO "userId";
        END IF;
      END $$
    `);

    // 3. Drop columns
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'owner') THEN
          ALTER TABLE "transactions" DROP COLUMN "owner";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'splitRatio') THEN
          ALTER TABLE "transactions" DROP COLUMN "splitRatio";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'transferType') THEN
          ALTER TABLE "transactions" DROP COLUMN "transferType";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'transferCounterparty') THEN
          ALTER TABLE "transactions" DROP COLUMN "transferCounterparty";
        END IF;
      END $$
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Optional: implement rollback if needed
  }
}
