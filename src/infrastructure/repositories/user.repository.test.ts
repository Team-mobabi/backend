import { Effect } from "effect";
import type { FindOperator, Repository } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { User as UserEntity } from "@src/infrastructure/database/entities/user.entity";
import { UserRepository } from "./user.repository";

describe("UserRepository.searchByEmail", () => {
  it("LIKE 와일드카드를 리터럴로 이스케이프한다", async () => {
    const find = vi.fn(async () => []);
    const repo = new UserRepository({
      find,
    } as unknown as Repository<UserEntity>);

    await Effect.runPromise(repo.searchByEmail("a%_\\b", 10));

    const [{ where, take }] = find.mock.calls[0] as unknown as [
      { where: { email: FindOperator<string> }; take: number },
    ];
    expect(where.email.value).toBe("%a\\%\\_\\\\b%");
    expect(take).toBe(10);
  });

  it("엔티티의 비밀번호 해시/토큰은 결과에 포함하지 않는다", async () => {
    const repo = new UserRepository({
      find: async () => [
        {
          id: "u1",
          email: "a@b.com",
          createdAt: new Date(),
          passwordHash: "hash",
          refreshTokenHash: "hash",
        },
      ],
    } as unknown as Repository<UserEntity>);

    const [user] = await Effect.runPromise(repo.searchByEmail("a", 10));
    expect(Object.keys(user).sort()).toEqual(["createdAt", "email", "id"]);
  });
});
