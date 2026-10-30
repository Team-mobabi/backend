import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Effect, Option } from "effect";
import { LessThan, Repository } from "typeorm";
import type { DbError } from "@src/common/error";
import { EmailVerification } from "@src/infrastructure/database/entities/email-verification.entity";
import { BaseRepository } from "./base.repository";

export interface PendingVerification {
  readonly id: string;
  readonly code: string;
  readonly expiresAt: Date;
  /** 이번 시도를 포함한 누적 시도 횟수 */
  readonly attempts: number;
}

@Injectable()
export class EmailVerificationRepository extends BaseRepository {
  constructor(
    @InjectRepository(EmailVerification)
    private readonly verifications: Repository<EmailVerification>,
  ) {
    super();
  }

  /** 미인증 코드를 새 코드로 교체 */
  replacePending(
    email: string,
    code: string,
    expiresAt: Date,
  ): Effect.Effect<void, DbError> {
    return this.query(async () => {
      await this.verifications.delete({ email, verified: false });
      await this.verifications.save(
        this.verifications.create({ email, code, expiresAt, verified: false }),
      );
    }, "인증 코드 저장에 실패했습니다");
  }

  /**
   * 미인증 코드의 시도 횟수를 1 늘리고 그 코드를 돌려준다. 이미 maxAttempts만큼
   * 시도했으면 None. 증가와 한도 확인을 한 UPDATE로 처리해 동시 요청으로도
   * 한도를 넘겨 비교할 수 없다.
   */
  consumeAttempt(
    email: string,
    maxAttempts: number,
  ): Effect.Effect<Option.Option<PendingVerification>, DbError> {
    return this.query(
      () =>
        this.verifications
          .createQueryBuilder()
          .update()
          .set({ attempts: () => `"attempts" + 1` })
          .where(
            `"email" = :email AND "verified" = false AND "attempts" < :maxAttempts`,
            { email, maxAttempts },
          )
          .returning(["id", "code", "expiresAt", "attempts"])
          .execute(),
      "인증 코드 조회에 실패했습니다",
    ).pipe(
      Effect.map(({ raw }) =>
        Option.fromNullable((raw as PendingVerification[])[0]),
      ),
    );
  }

  deleteById(id: string): Effect.Effect<void, DbError> {
    return this.query(
      () => this.verifications.delete(id),
      "인증 코드 삭제에 실패했습니다",
    ).pipe(Effect.asVoid);
  }

  markVerified(id: string): Effect.Effect<void, DbError> {
    return this.query(
      () => this.verifications.update(id, { verified: true }),
      "인증 상태 저장에 실패했습니다",
    ).pipe(Effect.asVoid);
  }

  deleteExpired(now: Date): Effect.Effect<void, DbError> {
    return this.query(
      () => this.verifications.delete({ expiresAt: LessThan(now) }),
      "만료된 인증 코드 정리에 실패했습니다",
    ).pipe(Effect.asVoid);
  }

  isVerified(email: string): Effect.Effect<boolean, DbError> {
    return this.query(
      () => this.verifications.exists({ where: { email, verified: true } }),
      "인증 여부 조회에 실패했습니다",
    );
  }

  clearVerified(email: string): Effect.Effect<void, DbError> {
    return this.query(
      () => this.verifications.delete({ email, verified: true }),
      "인증 기록 삭제에 실패했습니다",
    ).pipe(Effect.asVoid);
  }
}
