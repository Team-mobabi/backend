import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * refresh 토큰을 원문 대신 SHA-256 해시로 저장한다.
 * 기존 원문 토큰은 옮기지 않고 버리므로, 적용 시점에 로그인해 있던 사용자는
 * access 토큰이 만료된 뒤 다시 로그인해야 한다. down도 해시를 원문으로 되돌릴 수
 * 없어 저장된 토큰을 모두 비운다.
 */
export class HashRefreshTokens1793334070792 implements MigrationInterface {
  name = "HashRefreshTokens1793334070792";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "refreshToken"`);
    await queryRunner.query(
      `ALTER TABLE "user" ADD "refreshTokenHash" character varying(64)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_10e8bd5803555a1c4159e57c7d" ON "user" ("refreshTokenHash") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_10e8bd5803555a1c4159e57c7d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "refreshTokenHash"`,
    );
    await queryRunner.query(`ALTER TABLE "user" ADD "refreshToken" text`);
  }
}
