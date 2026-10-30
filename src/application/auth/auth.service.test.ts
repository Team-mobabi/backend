import { JwtService } from "@nestjs/jwt";
import { Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailVerificationService } from "@src/application/email/email-verification.service";
import type { UserAccount } from "@src/domain/user/user";
import { hashPassword } from "@src/infrastructure/auth/password";
import { hashRefreshToken } from "@src/infrastructure/auth/refresh-token";
import type { UserRepository } from "@src/infrastructure/repositories/user.repository";
import { AuthService } from "./auth.service";

const tagOf = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit) && exit.cause._tag === "Fail"
    ? exit.cause.error._tag
    : undefined;

describe("AuthService", () => {
  const jwt = new JwtService({ secret: "test-secret" });
  let account: UserAccount;
  let storedRefreshTokenHash: string | null;
  let users: Record<string, ReturnType<typeof vi.fn>>;
  let verification: Record<string, ReturnType<typeof vi.fn>>;
  let service: AuthService;

  beforeEach(async () => {
    account = {
      id: "u1",
      email: "a@b.com",
      createdAt: new Date(),
      passwordHash: await Effect.runPromise(hashPassword("password123")),
    };
    storedRefreshTokenHash = null;
    users = {
      findAccountByEmail: vi.fn((email: string) =>
        Effect.succeed(
          email === account.email ? Option.some(account) : Option.none(),
        ),
      ),
      findByRefreshTokenHash: vi.fn((hash: string) =>
        Effect.succeed(
          hash === storedRefreshTokenHash
            ? Option.some(account)
            : Option.none(),
        ),
      ),
      setRefreshTokenHash: vi.fn((_id: string, hash: string | null) =>
        Effect.sync(() => {
          storedRefreshTokenHash = hash;
        }),
      ),
      create: vi.fn(() => Effect.succeed(account)),
    };
    verification = {
      isVerified: vi.fn(() => Effect.succeed(true)),
      clear: vi.fn(() => Effect.void),
    };
    service = new AuthService(
      users as unknown as UserRepository,
      verification as unknown as EmailVerificationService,
      jwt,
    );
  });

  describe("signUp", () => {
    it("이미 가입된 이메일은 409", async () => {
      const exit = await Effect.runPromiseExit(
        service.signUp({ email: account.email, password: "password123" }),
      );
      expect(tagOf(exit)).toBe("EmailAlreadyInUseError");
    });

    it("이메일 인증 전에는 가입할 수 없다", async () => {
      verification.isVerified.mockReturnValueOnce(Effect.succeed(false));
      const exit = await Effect.runPromiseExit(
        service.signUp({ email: "new@b.com", password: "password123" }),
      );
      expect(tagOf(exit)).toBe("EmailNotVerifiedError");
      expect(users.create).not.toHaveBeenCalled();
    });

    it("가입 후 인증 기록을 정리하고 비밀번호는 해시로 저장한다", async () => {
      await Effect.runPromise(
        service.signUp({ email: "new@b.com", password: "password123" }),
      );
      const [, hash] = users.create.mock.calls[0];
      expect(hash).not.toBe("password123");
      expect(verification.clear).toHaveBeenCalledWith("new@b.com");
    });
  });

  describe("signIn", () => {
    it("비밀번호가 틀리면 401 (계정 존재 여부를 드러내지 않는다)", async () => {
      const wrong = await Effect.runPromiseExit(
        service.signIn({ email: account.email, password: "nope" }),
      );
      const unknown = await Effect.runPromiseExit(
        service.signIn({ email: "x@y.com", password: "password123" }),
      );
      expect(tagOf(wrong)).toBe("InvalidCredentialsError");
      expect(tagOf(unknown)).toBe("InvalidCredentialsError");
    });

    it("토큰 종류를 type claim으로 구분해 발급한다", async () => {
      const tokens = await Effect.runPromise(
        service.signIn({ email: account.email, password: "password123" }),
      );
      expect(jwt.decode(tokens.accessToken)).toMatchObject({
        sub: "u1",
        type: "access",
      });
      expect(jwt.decode(tokens.refreshToken)).toMatchObject({
        sub: "u1",
        type: "refresh",
      });
    });

    it("refresh 토큰은 원문 대신 SHA-256 해시로 저장한다", async () => {
      const { refreshToken } = await Effect.runPromise(
        service.signIn({ email: account.email, password: "password123" }),
      );
      expect(storedRefreshTokenHash).not.toBe(refreshToken);
      expect(storedRefreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(storedRefreshTokenHash).toBe(hashRefreshToken(refreshToken));
    });
  });

  describe("refresh", () => {
    const signIn = () =>
      Effect.runPromise(
        service.signIn({ email: account.email, password: "password123" }),
      );

    it("저장된 refresh 토큰으로 access 토큰을 재발급한다", async () => {
      const { refreshToken } = await signIn();
      const { accessToken } = await Effect.runPromise(
        service.refresh(refreshToken),
      );
      expect(jwt.decode(accessToken)).toMatchObject({ type: "access" });
    });

    it("access 토큰으로는 재발급할 수 없다", async () => {
      const { accessToken } = await signIn();
      storedRefreshTokenHash = hashRefreshToken(accessToken);
      const exit = await Effect.runPromiseExit(service.refresh(accessToken));
      expect(tagOf(exit)).toBe("InvalidRefreshTokenError");
    });

    it("로그아웃으로 폐기된 토큰은 거부한다", async () => {
      const { refreshToken } = await signIn();
      await Effect.runPromise(service.logout("u1"));
      const exit = await Effect.runPromiseExit(service.refresh(refreshToken));
      expect(tagOf(exit)).toBe("InvalidRefreshTokenError");
    });

    it("DB에 저장된 해시값 자체로는 재발급할 수 없다", async () => {
      await signIn();
      const exit = await Effect.runPromiseExit(
        service.refresh(storedRefreshTokenHash ?? ""),
      );
      expect(tagOf(exit)).toBe("InvalidRefreshTokenError");
    });

    it("새로 로그인하면 이전 refresh 토큰은 폐기된다", async () => {
      const first = await signIn();
      // JWT iat가 초 단위라 같은 초에 발급하면 토큰이 같아진다
      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 2_000 });
      await signIn().finally(() => vi.useRealTimers());
      const exit = await Effect.runPromiseExit(
        service.refresh(first.refreshToken),
      );
      expect(tagOf(exit)).toBe("InvalidRefreshTokenError");
    });

    it("서명이 다른 토큰은 거부한다", async () => {
      const forged = new JwtService({ secret: "other" }).sign({
        sub: "u1",
        email: account.email,
        type: "refresh",
      });
      storedRefreshTokenHash = hashRefreshToken(forged);
      const exit = await Effect.runPromiseExit(service.refresh(forged));
      expect(tagOf(exit)).toBe("InvalidRefreshTokenError");
    });
  });
});
