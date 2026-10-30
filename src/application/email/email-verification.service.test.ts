import { Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERIFICATION_MAX_ATTEMPTS } from "@src/domain/email/email";
import type { MailerService } from "@src/infrastructure/email/mailer.service";
import type { EmailVerificationRepository } from "@src/infrastructure/repositories/email-verification.repository";
import { EmailVerificationService } from "./email-verification.service";

describe("EmailVerificationService", () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let mailer: { send: ReturnType<typeof vi.fn> };
  let service: EmailVerificationService;

  beforeEach(() => {
    repo = {
      replacePending: vi.fn(() => Effect.void),
      consumeAttempt: vi.fn(() => Effect.succeed(Option.none())),
      deleteById: vi.fn(() => Effect.void),
      markVerified: vi.fn(() => Effect.void),
      deleteExpired: vi.fn(() => Effect.void),
    };
    mailer = { send: vi.fn(() => Effect.void) };
    service = new EmailVerificationService(
      repo as unknown as EmailVerificationRepository,
      mailer as unknown as MailerService,
    );
  });

  it("6자리 코드를 저장하고 메일 본문에 담아 보낸다", async () => {
    await Effect.runPromise(service.send("a@b.com"));
    const [email, code, expiresAt] = repo.replacePending.mock.calls[0];
    expect(email).toBe("a@b.com");
    expect(code).toMatch(/^\d{6}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mailer.send.mock.calls[0][0].html).toContain(code);
  });

  describe("verify", () => {
    // consumeAttempt의 원자적 UPDATE를 흉내 내는 단일 행 저장소
    let row: {
      id: string;
      code: string;
      expiresAt: Date;
      attempts: number;
    } | null;

    beforeEach(() => {
      row = {
        id: "v1",
        code: "123456",
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      };
      repo.consumeAttempt = vi.fn((_email: string, max: number) =>
        Effect.sync(() => {
          if (row === null || row.attempts >= max) return Option.none();
          row.attempts += 1;
          return Option.some({ ...row });
        }),
      );
      repo.deleteById = vi.fn(() =>
        Effect.sync(() => {
          row = null;
        }),
      );
    });

    const verify = (code: string) =>
      Effect.runPromiseExit(service.verify({ email: "a@b.com", code }));

    it("유효한 코드는 인증 처리한다", async () => {
      await Effect.runPromise(
        service.verify({ email: "a@b.com", code: "123456" }),
      );
      expect(repo.consumeAttempt).toHaveBeenCalledWith(
        "a@b.com",
        VERIFICATION_MAX_ATTEMPTS,
      );
      expect(repo.markVerified).toHaveBeenCalledWith("v1");
      expect(repo.deleteExpired).toHaveBeenCalled();
    });

    it("발급된 코드가 없으면 거부한다", async () => {
      row = null;
      const exit = await verify("123456");
      expect(Exit.isFailure(exit)).toBe(true);
      expect(repo.markVerified).not.toHaveBeenCalled();
      expect(repo.deleteExpired).toHaveBeenCalled();
    });

    it("틀린 코드는 거부하고 시도 횟수를 차감한다", async () => {
      const exit = await verify("000000");
      expect(JSON.stringify(exit)).toContain("유효하지 않은");
      expect(row?.attempts).toBe(1);
      expect(repo.markVerified).not.toHaveBeenCalled();
    });

    it("만료된 코드는 맞더라도 거부한다", async () => {
      if (row) row.expiresAt = new Date(0);
      const exit = await verify("123456");
      expect(JSON.stringify(exit)).toContain("만료");
      expect(repo.markVerified).not.toHaveBeenCalled();
    });

    it(`${VERIFICATION_MAX_ATTEMPTS}번 틀리면 코드를 폐기해 이후 정답도 거부한다`, async () => {
      for (let i = 1; i < VERIFICATION_MAX_ATTEMPTS; i++) {
        expect(JSON.stringify(await verify("000000"))).toContain(
          "유효하지 않은",
        );
      }
      expect(JSON.stringify(await verify("000000"))).toContain("초과");
      expect(repo.deleteById).toHaveBeenCalledWith("v1");

      const exit = await verify("123456");
      expect(Exit.isFailure(exit)).toBe(true);
      expect(repo.markVerified).not.toHaveBeenCalled();
    });

    it("한도 직전까지 틀려도 마지막 시도에 정답이면 인증된다", async () => {
      for (let i = 1; i < VERIFICATION_MAX_ATTEMPTS; i++) {
        await verify("000000");
      }
      await Effect.runPromise(
        service.verify({ email: "a@b.com", code: "123456" }),
      );
      expect(repo.markVerified).toHaveBeenCalledWith("v1");
      expect(repo.deleteById).not.toHaveBeenCalled();
    });
  });
});
