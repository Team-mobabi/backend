import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import type { UserRepository } from "@src/infrastructure/repositories/user.repository";
import { JwtStrategy } from "./jwt.strategy";

const user = { id: "u1", email: "a@b.com", createdAt: new Date() };
const strategy = new JwtStrategy(
  {
    findById: (id: string) =>
      Effect.succeed(id === "u1" ? Option.some(user) : Option.none()),
  } as unknown as UserRepository,
  { getOrThrow: () => "secret" } as unknown as ConfigService,
);

describe("JwtStrategy.validate", () => {
  it("access 토큰은 도메인 User를 반환한다", async () => {
    await expect(
      strategy.validate({ sub: "u1", email: "a@b.com", type: "access" }),
    ).resolves.toEqual(user);
  });

  it("type이 없는 기존 access 토큰도 허용한다", async () => {
    await expect(
      strategy.validate({ sub: "u1", email: "a@b.com" }),
    ).resolves.toEqual(user);
  });

  it("refresh 토큰은 API 인증에 쓸 수 없다", async () => {
    await expect(
      strategy.validate({ sub: "u1", email: "a@b.com", type: "refresh" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("탈퇴한 사용자나 잘못된 payload는 거부한다", async () => {
    await expect(
      strategy.validate({ sub: "gone", email: "a@b.com" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(strategy.validate({ foo: 1 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
