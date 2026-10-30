import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ConfigService } from "@nestjs/config";
import { Effect, Exit, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepoWorkspaceService } from "@src/application/repo/repo-workspace.service";
import type { CollaboratorRole } from "@src/domain/repo/collaborator-role";
import { RepoStorageService } from "@src/infrastructure/git/repo-storage.service";
import type { CollaboratorRepository } from "@src/infrastructure/repositories/collaborator.repository";
import type { RepoRepository } from "@src/infrastructure/repositories/repo.repository";
import { BranchService } from "./branch.service";
import { GitDiffService } from "./git-diff.service";
import { GitOperationService } from "./git-operation.service";
import { GitRemoteService } from "./git-remote.service";

const REPO = "11111111-1111-4111-8111-111111111111";
const alice = { id: "alice", email: "alice@x.com", createdAt: new Date() };
const bob = { id: "bob", email: "bob@x.com", createdAt: new Date() };

const tagOf = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit) && exit.cause._tag === "Fail"
    ? exit.cause.error._tag
    : undefined;
const errorOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) && exit.cause._tag === "Fail"
    ? (exit.cause.error as Record<string, unknown>)
    : undefined;

describe("git 서비스 (실제 git 저장소)", () => {
  let base: string;
  let storage: RepoStorageService;
  let roles: Record<string, CollaboratorRole>;
  let ops: GitOperationService;
  let remote: GitRemoteService;
  let branches: BranchService;
  let diff: GitDiffService;

  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
  const exit = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromiseExit(effect);
  const write = (user: string, file: string, content: string) =>
    fs.writeFile(path.join(storage.workingCopyPath(user, REPO), file), content);
  const commitAll = async (user: typeof alice, message: string) => {
    await run(ops.add(REPO, user.id, undefined));
    return run(ops.commit(REPO, user, { message }));
  };

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "git-int-"));
    storage = new RepoStorageService({
      get: (key: string, fallback?: string) =>
        ({
          ENV: "dev",
          REPO_LOCAL_BASE_PATH: path.join(base, "repos"),
          REMOTE_LOCAL_BASE_PATH: path.join(base, "remote"),
        })[key] ?? fallback,
    } as unknown as ConfigService);
    roles = {};
    const workspaces = new RepoWorkspaceService(
      {
        findById: () =>
          Effect.succeed(
            Option.some({
              repoId: REPO,
              ownerId: alice.id,
              name: "demo",
              description: null,
              isPrivate: false,
              forkedFrom: null,
              createdAt: new Date(),
            }),
          ),
      } as unknown as RepoRepository,
      {
        findRole: (_: string, userId: string) =>
          Effect.succeed(Option.fromNullable(roles[userId])),
      } as unknown as CollaboratorRepository,
      storage,
    );
    ops = new GitOperationService(workspaces);
    remote = new GitRemoteService(workspaces, storage);
    branches = new BranchService(workspaces, storage);
    diff = new GitDiffService(workspaces, storage);

    await run(storage.initialize(REPO, alice.id));
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it("커밋 → push → 다른 사용자 pull 흐름", async () => {
    await write("alice", "a.txt", "hello");
    const committed = await commitAll(alice, "add a");
    expect(committed.message).toBe("add a");

    const pushed = await run(
      remote.push(REPO, alice.id, { remote: "origin", force: false }),
    );
    expect(pushed.upToDate).toBe(false);

    // bob은 공개 레포 열람자 → 작업 사본이 clone된다
    const status = await run(ops.status(REPO, bob.id));
    expect(status.allFiles).toContain("a.txt");

    const again = await run(
      remote.pull(REPO, bob.id, { remote: "origin", ffOnly: false }),
    );
    expect(again).toEqual({ upToDate: true });
  });

  it("read 권한(또는 열람자)은 push할 수 없다", async () => {
    await run(remote.push(REPO, alice.id, { remote: "origin", force: false }));
    roles.bob = "read";
    await write("alice", "x.txt", "x");
    await run(ops.status(REPO, bob.id));
    await write("bob", "b.txt", "b");
    await commitAll(bob, "bob change");

    const denied = await exit(
      remote.push(REPO, bob.id, { remote: "origin", force: true }),
    );
    expect(tagOf(denied)).toBe("RepoAccessDeniedError");

    roles.bob = "write";
    const allowed = await exit(
      remote.push(REPO, bob.id, { remote: "origin", force: false }),
    );
    expect(Exit.isSuccess(allowed)).toBe(true);
  });

  it("원격이 앞서 있으면 push가 non-fast-forward로 거부되고 상세 정보를 담는다", async () => {
    await run(remote.push(REPO, alice.id, { remote: "origin", force: false }));
    roles.bob = "write";
    await run(ops.status(REPO, bob.id));
    await write("bob", "b.txt", "b");
    await commitAll(bob, "bob");
    await run(remote.push(REPO, bob.id, { remote: "origin", force: false }));

    await write("alice", "a.txt", "a");
    await commitAll(alice, "alice");
    const rejected = await exit(
      remote.push(REPO, alice.id, { remote: "origin", force: false }),
    );
    expect(tagOf(rejected)).toBe("GitConflictError");
    expect(errorOf(rejected)?.details).toMatchObject({
      error: "Push Rejected",
      reason: "non-fast-forward",
    });
  });

  it("커밋할 것이 없으면 400, 커밋되지 않은 변경이 있으면 pull 불가", async () => {
    expect(
      tagOf(await exit(ops.commit(REPO, alice, { message: "empty" }))),
    ).toBe("GitPreconditionError");

    await run(remote.push(REPO, alice.id, { remote: "origin", force: false }));
    await fs.writeFile(
      path.join(storage.workingCopyPath("alice", REPO), "tracked.txt"),
      "1",
    );
    await commitAll(alice, "tracked");
    await write("alice", "tracked.txt", "2");
    const dirty = await exit(
      remote.pull(REPO, alice.id, { remote: "origin", ffOnly: false }),
    );
    expect(tagOf(dirty)).toBe("GitPreconditionError");
    expect(errorOf(dirty)?.details).toMatchObject({ changes: ["tracked.txt"] });
  });

  it("없는 커밋으로 reset하면 404, 있으면 되돌린다", async () => {
    expect(
      tagOf(await exit(ops.reset(REPO, alice.id, "deadbeef", "mixed"))),
    ).toBe("GitRefNotFoundError");

    await write("alice", "a.txt", "a");
    await commitAll(alice, "second");
    const result = await run(ops.reset(REPO, alice.id, "HEAD~1", "hard"));
    expect(result.message).toMatch(/^Hard reset: /);
    expect(result.from).not.toBe(result.to);
  });

  it("브랜치 생성/중복/전환/삭제 오류를 도메인 에러로 변환한다", async () => {
    await run(branches.create(REPO, alice.id, "feature"));
    expect(tagOf(await exit(branches.create(REPO, alice.id, "feature")))).toBe(
      "GitConflictError",
    );
    expect(
      tagOf(await exit(branches.create(REPO, alice.id, "x", "nope"))),
    ).toBe("GitRefNotFoundError");
    expect(tagOf(await exit(branches.switch(REPO, alice.id, "ghost")))).toBe(
      "GitRefNotFoundError",
    );
    expect(tagOf(await exit(branches.delete(REPO, alice.id, "feature")))).toBe(
      "GitConflictError",
    );

    const list = await run(branches.list(REPO, alice.id, 20));
    expect(list.currentBranch).toBe("feature");
    expect(list.branches.map((b) => b.name).sort()).toEqual([
      "feature",
      "main",
    ]);
  });

  it("병합 충돌은 409로 알리고 작업 사본을 충돌 상태로 남긴다", async () => {
    await write("alice", "same.txt", "base");
    await commitAll(alice, "base");
    await run(branches.create(REPO, alice.id, "feature"));
    await write("alice", "same.txt", "feature");
    await commitAll(alice, "feature change");
    await run(branches.switch(REPO, alice.id, "main"));
    await write("alice", "same.txt", "main");
    await commitAll(alice, "main change");

    const conflict = await exit(
      branches.merge(REPO, alice.id, {
        sourceBranch: "feature",
        fastForwardOnly: false,
      }),
    );
    expect(tagOf(conflict)).toBe("GitConflictError");

    const blocked = await exit(
      branches.merge(REPO, alice.id, {
        sourceBranch: "feature",
        fastForwardOnly: false,
      }),
    );
    expect(String(errorOf(blocked)?.message)).toContain("충돌 파일: same.txt");
  });

  it("그래프와 diff를 계산한다", async () => {
    await write("alice", "a.txt", "one\n");
    await commitAll(alice, "msg | with pipe");
    await write("alice", "a.txt", "two\n");

    const graph = await run(branches.graph(REPO, alice.id, 50));
    expect(graph.commits[0].message).toBe("msg | with pipe");
    expect(graph.currentBranch).toBe("main");

    const working = await run(diff.working(REPO, alice.id));
    expect(working[0]).toMatchObject({
      path: "a.txt",
      additions: 1,
      deletions: 1,
    });

    const stats = await run(diff.stats(REPO, alice.id, "HEAD"));
    expect(stats).toMatchObject({ files: 1, additions: 1 });

    // 부모가 없는 첫 커밋도 빈 트리와 비교해 조회할 수 있다
    const root = (await run(branches.graph(REPO, alice.id, 50))).commits.at(-1);
    const rootFiles = await run(diff.changedFiles(REPO, alice.id, root?.hash));
    expect(rootFiles).toEqual([]);
  });
});
