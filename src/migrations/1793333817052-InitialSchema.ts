import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1793333817052 implements MigrationInterface {
  name = "InitialSchema1793333817052";

  /**
   * 기존 prod DB(synchronize로 생성됨)에는 실행하지 말고 "적용됨"으로만 표시한다.
   * 절차는 docs/migrations.md 참고
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "email_verification" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "code" character varying NOT NULL, "verified" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_b985a8362d9dac51e3d6120d40e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "refreshToken" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "repo" ("repoId" uuid NOT NULL DEFAULT uuid_generate_v4(), "ownerId" uuid NOT NULL, "name" character varying(100) NOT NULL, "description" text, "isPrivate" boolean NOT NULL DEFAULT false, "gitPath" character varying(255), "forkedFrom" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_90bb5fd3eb16203935bec54220a" PRIMARY KEY ("repoId"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pull_requests_status_enum" AS ENUM('open', 'merged', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "pull_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "description" text, "sourceBranch" character varying NOT NULL, "targetBranch" character varying NOT NULL, "authorId" character varying NOT NULL, "status" "public"."pull_requests_status_enum" NOT NULL DEFAULT 'open', "mergedAt" TIMESTAMP, "mergedBy" character varying, "mergeCommitHash" character varying, "requiresApproval" boolean NOT NULL DEFAULT true, "repoId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e8a8aa8710c3a9650a19a9c2e7b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pr_reviews_status_enum" AS ENUM('approved', 'changes_requested', 'commented')`,
    );
    await queryRunner.query(
      `CREATE TABLE "pr_reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "pullRequestId" uuid NOT NULL, "reviewerId" character varying NOT NULL, "status" "public"."pr_reviews_status_enum" NOT NULL, "comment" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a06bfd13fe34f517fd2d5d52f71" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."repo_collaborators_role_enum" AS ENUM('read', 'write', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "repo_collaborators" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "repoId" uuid NOT NULL, "userId" uuid NOT NULL, "role" "public"."repo_collaborators_role_enum" NOT NULL DEFAULT 'read', "addedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97490241e39ce8f5caa579f42e9" UNIQUE ("repoId", "userId"), CONSTRAINT "PK_8604c6a5dfbabd6584c736110eb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "repo" ADD CONSTRAINT "FK_c9e09ec6c1f5a017144f99d2afd" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pull_requests" ADD CONSTRAINT "FK_b31de2a04c026344c991d4cb6ba" FOREIGN KEY ("repoId") REFERENCES "repo"("repoId") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pr_reviews" ADD CONSTRAINT "FK_8f25837ced089b69caedb2e94b6" FOREIGN KEY ("pullRequestId") REFERENCES "pull_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "repo_collaborators" ADD CONSTRAINT "FK_032a69c9e2c32b1c6dee629cf00" FOREIGN KEY ("repoId") REFERENCES "repo"("repoId") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "repo_collaborators" ADD CONSTRAINT "FK_576a94c5ef8616a0f1eaa130ed9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "repo_collaborators" DROP CONSTRAINT "FK_576a94c5ef8616a0f1eaa130ed9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "repo_collaborators" DROP CONSTRAINT "FK_032a69c9e2c32b1c6dee629cf00"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pr_reviews" DROP CONSTRAINT "FK_8f25837ced089b69caedb2e94b6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pull_requests" DROP CONSTRAINT "FK_b31de2a04c026344c991d4cb6ba"`,
    );
    await queryRunner.query(
      `ALTER TABLE "repo" DROP CONSTRAINT "FK_c9e09ec6c1f5a017144f99d2afd"`,
    );
    await queryRunner.query(`DROP TABLE "repo_collaborators"`);
    await queryRunner.query(
      `DROP TYPE "public"."repo_collaborators_role_enum"`,
    );
    await queryRunner.query(`DROP TABLE "pr_reviews"`);
    await queryRunner.query(`DROP TYPE "public"."pr_reviews_status_enum"`);
    await queryRunner.query(`DROP TABLE "pull_requests"`);
    await queryRunner.query(`DROP TYPE "public"."pull_requests_status_enum"`);
    await queryRunner.query(`DROP TABLE "repo"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TABLE "email_verification"`);
  }
}
