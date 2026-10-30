import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVerificationAttempts1793333977612
  implements MigrationInterface
{
  name = "AddVerificationAttempts1793333977612";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_verification" ADD "attempts" integer NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_verification" DROP COLUMN "attempts"`,
    );
  }
}
