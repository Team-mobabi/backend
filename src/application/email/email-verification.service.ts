import { randomInt } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Effect } from "effect";
import { getOrFail } from "@src/common/effect";
import {
  type DbError,
  type EmailDeliveryError,
  VerificationCodeError,
} from "@src/common/error";
import {
  VERIFICATION_CODE_TTL_MINUTES,
  type VerifyCodeBody,
} from "@src/domain/email/email";
import { MailerService } from "@src/infrastructure/email/mailer.service";
import { EmailVerificationRepository } from "@src/infrastructure/repositories/email-verification.repository";

const renderVerificationMail = (code: string): string => `
  <div style="font-family: Arial, sans-serif; padding: 20px;">
    <h2>이메일 인증 코드</h2>
    <p>아래의 인증 코드를 입력해주세요:</p>
    <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px;">
      ${code}
    </div>
    <p style="color: #666; margin-top: 20px;">이 코드는 ${VERIFICATION_CODE_TTL_MINUTES}분 후에 만료됩니다.</p>
    <p style="color: #666;">본인이 요청하지 않았다면 이 이메일을 무시해주세요.</p>
  </div>
`;

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly verificationRepository: EmailVerificationRepository,
    private readonly mailer: MailerService,
  ) {}

  send(email: string): Effect.Effect<void, DbError | EmailDeliveryError> {
    // 인증 코드는 추측 가능하면 안 되므로 암호학적 난수를 사용
    const code = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(
      Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000,
    );

    return this.verificationRepository
      .replacePending(email, code, expiresAt)
      .pipe(
        Effect.zipRight(
          this.mailer.send({
            to: email,
            subject: "이메일 인증 코드",
            html: renderVerificationMail(code),
          }),
        ),
      );
  }

  verify({
    email,
    code,
  }: VerifyCodeBody): Effect.Effect<void, DbError | VerificationCodeError> {
    const now = new Date();
    return this.verificationRepository.findPending(email, code).pipe(
      getOrFail(
        () =>
          new VerificationCodeError({
            message: "유효하지 않은 인증 코드입니다. 다시 확인해주세요.",
          }),
      ),
      Effect.filterOrFail(
        (pending) => pending.expiresAt >= now,
        () =>
          new VerificationCodeError({
            message: "인증 코드가 만료되었습니다. 새로운 코드를 요청해주세요.",
          }),
      ),
      Effect.flatMap((pending) =>
        this.verificationRepository.markVerified(pending.id),
      ),
      Effect.ensuring(
        this.verificationRepository.deleteExpired(now).pipe(Effect.ignore),
      ),
    );
  }

  isVerified(email: string): Effect.Effect<boolean, DbError> {
    return this.verificationRepository.isVerified(email);
  }

  /** 회원가입 완료 후 인증 기록 정리 */
  clear(email: string): Effect.Effect<void, DbError> {
    return this.verificationRepository.clearVerified(email);
  }
}
