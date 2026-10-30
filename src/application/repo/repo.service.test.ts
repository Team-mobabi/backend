import { Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitOperationError } from "@src/common/error";
import type { Repo } from "@src/domain/repo/repo";
import type { RepoStorageService } from "@src/infrastructure/git/repo-storage.service";
import type { RepoRepository } from "@src/infrastructure/repositories/repo.repository";
import { RepoService } from "./repo.service";

const tagOf = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit) && exit.cause._tag === "Fail"
    ? exit.cause.error._tag
    : undefined;

const makeRepo = (overrides: Partial<Repo> = {}): Repo => ({
  repoId: "11111111-1111-4111-8111-111111111111",
  ownerId: "owner",
  name: "demo",
  description: null,
  isPrivate: false,
  forkedFrom: null,
  createdAt: new Date(),
  ...overrides,
});

describe("RepoService", () => {
  let repos: Record<string, ReturnType<typeof vi.fn>>;
  let storage: Record<string, ReturnType<typeof vi.fn>>;
  let service: RepoService;

  beforeEach(() => {
    repos = {
      create: vi.fn((data) => Effect.succeed(makeRepo({ ...data }))),
      findById: vi.fn(() => Effect.succeed(Option.some(makeRepo()))),
      findView: vi.fn(() => Effect.succeed(Option.some(makeRepo()))),
      delete: vi.fn(() => Effect.void),
      deleteWithRelations: vi.fn(() => Effect.void),
    };
    storage = {
      initialize: vi.fn(() => Effect.void),
      fork: vi.fn(() => Effect.void),
      removeAll: vi.fn(() => Effect.void),
    };
    service = new RepoService(
      repos as unknown as RepoRepository,
      storage as unknown as RepoStorageService,
    );
  });

  it("git 초기화가 실패하면 DB 행과 파일을 되돌린다", async () => {
    storage.initialize.mockReturnValueOnce(
      Effect.fail(
        new GitOperationError({
          message: "init 실패",
          operation: "init",
          originalError: null,
        }),
      ),
    );
    const exit = await Effect.runPromiseExit(
      service.create({ name: "demo", isPrivate: false }, "owner"),
    );
    expect(tagOf(exit)).toBe("GitOperationError");
    expect(repos.delete).toHaveBeenCalled();
    expect(storage.removeAll).toHaveBeenCalled();
  });

  it("남의 비공개 레포는 Fork할 수 없다", async () => {
    repos.findById.mockReturnValueOnce(
      Effect.succeed(Option.some(makeRepo({ isPrivate: true }))),
    );
    const exit = await Effect.runPromiseExit(
      service.fork(
        { sourceRepoId: makeRepo().repoId, isPrivate: false },
        "other",
      ),
    );
    expect(tagOf(exit)).toBe("RepoAccessDeniedError");
    expect(repos.create).not.toHaveBeenCalled();
  });

  it("Fork 이름을 생략하면 원본 이름을 쓰고 출처를 기록한다", async () => {
    await Effect.runPromise(
      service.fork({ sourceRepoId: makeRepo().repoId, isPrivate: true }, "u2"),
    );
    expect(repos.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "u2",
        name: "demo",
        isPrivate: true,
        forkedFrom: makeRepo().repoId,
      }),
    );
  });

  it("소유자만 삭제할 수 있고, DB 삭제 후 파일을 정리한다", async () => {
    // Effect는 지연 실행이므로 메서드 호출이 아니라 실제 실행 순서를 기록한다
    const executed: string[] = [];
    repos.deleteWithRelations.mockImplementation(() =>
      Effect.sync(() => executed.push("db")),
    );
    storage.removeAll.mockImplementation(() =>
      Effect.sync(() => executed.push("files")),
    );

    const denied = await Effect.runPromiseExit(
      service.delete(makeRepo().repoId, "other"),
    );
    expect(tagOf(denied)).toBe("RepoAccessDeniedError");
    expect(executed).toEqual([]);

    await Effect.runPromise(service.delete(makeRepo().repoId, "owner"));
    expect(executed).toEqual(["db", "files"]);
  });
});
