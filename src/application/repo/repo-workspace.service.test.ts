import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ConfigService } from "@nestjs/config";
import { Effect, Exit, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollaboratorRole } from "@src/domain/repo/collaborator-role";
import type { Repo } from "@src/domain/repo/repo";
import type { CollaboratorRepository } from "@src/infrastructure/repositories/collaborator.repository";
import type { RepoRepository } from "@src/infrastructure/repositories/repo.repository";
import { RepoStorageService } from "@src/infrastructure/git/repo-storage.service";
import { RepoWorkspaceService } from "./repo-workspace.service";

const REPO_ID = "11111111-1111-4111-8111-111111111111";
const OWNER = "owner";
const OTHER = "other";

const makeRepo = (overrides: Partial<Repo> = {}): Repo => ({
  repoId: REPO_ID,
  ownerId: OWNER,
  name: "demo",
  description: null,
  isPrivate: true,
  forkedFrom: null,
  createdAt: new Date(),
  ...overrides,
});

describe("RepoWorkspaceService.open", () => {
  let base: string;

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "ws-test-"));
    // 작업 사본이 이미 있는 상태로 만들어 clone을 건너뛴다
    for (const user of [OWNER, OTHER]) {
      await fs.mkdir(path.join(base, "repos", user, REPO_ID), {
        recursive: true,
      });
    }
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  const setup = (repo: Option.Option<Repo>, role?: CollaboratorRole) => {
    const findRole = vi.fn(() => Effect.succeed(Option.fromNullable(role)));
    const config = {
      get: (key: string, fallback?: string) =>
        ({
          ENV: "dev",
          REPO_LOCAL_BASE_PATH: path.join(base, "repos"),
          REMOTE_LOCAL_BASE_PATH: path.join(base, "remote"),
        })[key] ?? fallback,
    } as unknown as ConfigService;
    const service = new RepoWorkspaceService(
      { findById: () => Effect.succeed(repo) } as unknown as RepoRepository,
      { findRole } as unknown as CollaboratorRepository,
      new RepoStorageService(config),
    );
    return { service, findRole };
  };

  const tagOf = (exit: Exit.Exit<unknown, { _tag: string }>) =>
    Exit.isFailure(exit) && exit.cause._tag === "Fail"
      ? exit.cause.error._tag
      : undefined;

  it("레포가 없으면 RepoNotFoundError", async () => {
    const { service } = setup(Option.none());
    const exit = await Effect.runPromiseExit(service.open(REPO_ID, OWNER));
    expect(tagOf(exit)).toBe("RepoNotFoundError");
  });

  it("소유자는 협업자 조회 없이 사용자별 작업 사본을 연다", async () => {
    const { service, findRole } = setup(Option.some(makeRepo()));
    const workspace = await Effect.runPromise(
      service.open(REPO_ID, OWNER, "admin"),
    );
    expect(workspace.root).toBe(path.join(base, "repos", OWNER, REPO_ID));
    expect(findRole).not.toHaveBeenCalled();
  });

  it("공개 레포는 협업자가 아니어도 읽을 수 있다", async () => {
    const { service } = setup(Option.some(makeRepo({ isPrivate: false })));
    const exit = await Effect.runPromiseExit(service.open(REPO_ID, OTHER));
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("공개 레포라도 쓰기는 협업자 권한이 필요하다", async () => {
    const { service } = setup(Option.some(makeRepo({ isPrivate: false })));
    const exit = await Effect.runPromiseExit(
      service.open(REPO_ID, OTHER, "write"),
    );
    expect(tagOf(exit)).toBe("RepoAccessDeniedError");
  });

  it("비공개 레포는 협업자가 아니면 거부한다", async () => {
    const { service } = setup(Option.some(makeRepo()));
    const exit = await Effect.runPromiseExit(service.open(REPO_ID, OTHER));
    expect(tagOf(exit)).toBe("RepoAccessDeniedError");
  });

  it("협업자 권한이 부족하면 거부하고, 충분하면 허용한다", async () => {
    const readOnly = setup(Option.some(makeRepo()), "read");
    expect(
      tagOf(
        await Effect.runPromiseExit(
          readOnly.service.open(REPO_ID, OTHER, "write"),
        ),
      ),
    ).toBe("RepoAccessDeniedError");

    const writer = setup(Option.some(makeRepo()), "write");
    const exit = await Effect.runPromiseExit(
      writer.service.open(REPO_ID, OTHER, "write"),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });
});
