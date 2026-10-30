import { Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      findPending: vi.fn(() => Effect.succeed(Option.none())),
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

  it("없는 코드는 거부한다", async () => {
    const exit = await Effect.runPromiseExit(
      service.verify({ email: "a@b.com", code: "123456" }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(repo.markVerified).not.toHaveBeenCalled();
    expect(repo.deleteExpired).toHaveBeenCalled();
  });

  it("만료된 코드는 거부하고, 유효한 코드는 인증 처리한다", async () => {
    repo.findPending.mockReturnValueOnce(
      Effect.succeed(Option.some({ id: "v1", expiresAt: new Date(0) })),
    );
    const expired = await Effect.runPromiseExit(
      service.verify({ email: "a@b.com", code: "123456" }),
    );
    expect(JSON.stringify(expired)).toContain("만료");

    repo.findPending.mockReturnValueOnce(
      Effect.succeed(
        Option.some({ id: "v2", expiresAt: new Date(Date.now() + 60_000) }),
      ),
    );
    await Effect.runPromise(
      service.verify({ email: "a@b.com", code: "123456" }),
    );
    expect(repo.markVerified).toHaveBeenCalledWith("v2");
  });
});
