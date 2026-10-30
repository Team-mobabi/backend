import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ConfigService } from "@nestjs/config";
import { Effect, Exit, Option } from "effect";
import simpleGit from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BranchService } from "@src/application/git/branch.service";
import { GitDiffService } from "@src/application/git/git-diff.service";
import { GitOperationService } from "@src/application/git/git-operation.service";
import { GitRemoteService } from "@src/application/git/git-remote.service";
import { RepoWorkspaceService } from "@src/application/repo/repo-workspace.service";
import type { PullRequest } from "@src/domain/pull-request/pull-request";
import type { CollaboratorRole } from "@src/domain/repo/collaborator-role";
import { RepoStorageService } from "@src/infrastructure/git/repo-storage.service";
import type { CollaboratorRepository } from "@src/infrastructure/repositories/collaborator.repository";
import type { PullRequestRepository } from "@src/infrastructure/repositories/pull-request.repository";
import type { RepoRepository } from "@src/infrastructure/repositories/repo.repository";
import { PullRequestService } from "./pull-request.service";

const REPO = "22222222-2222-4222-8222-222222222222";
const alice = { id: "alice", email: "alice@x.com", createdAt: new Date() };
const bob = { id: "bob", email: "bob@x.com", createdAt: new Date() };

const tagOf = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit) && exit.cause._tag === "Fail"
    ? exit.cause.error._tag
    : undefined;

/** DB 대신 메모리에 PR을 보관하는 최소 구현 */
const inMemoryPullRequests = () => {
  const rows = new Map<string, PullRequest>();
  const update = (id: string, patch: Partial<PullRequest>) =>
    Effect.sync(() => {
      const next = { ...(rows.get(id) as PullRequest), ...patch };
      rows.set(id, next);
      return next;
    });
  return {
    rows,
    repository: {
      find: (_: string, id: string) =>
        Effect.sync(() => Option.fromNullable(rows.get(id))),
      findOpen: () => Effect.succeed(Option.none()),
      create: (data: Omit<PullRequest, "id">) =>
        Effect.sync(() => {
          const pr: PullRequest = {
            ...data,
            id: `pr${rows.size + 1}`,
            status: "open",
            mergedAt: null,
            mergedBy: null,
            mergeCommitHash: null,
            requiresApproval: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          rows.set(pr.id, pr);
          return pr;
        }),
      countApprovals: () => Effect.succeed(0),
      markMerged: (pr: PullRequest, mergedBy: string, hash: string) =>
        update(pr.id, {
          status: "merged",
          mergedBy,
          mergeCommitHash: hash,
          mergedAt: new Date(),
        }),
    } as unknown as PullRequestRepository,
  };
};

describe("PR 병합 (실제 git 저장소)", () => {
  let base: string;
  let storage: RepoStorageService;
  let ops: GitOperationService;
  let remote: GitRemoteService;
  let branches: BranchService;
  let prs: ReturnType<typeof inMemoryPullRequests>;
  let service: PullRequestService;

  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
  const exit = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromiseExit(effect);
  const write = (user: string, file: string, content: string) =>
    fs.writeFile(path.join(storage.workingCopyPath(user, REPO), file), content);
  const commitAll = async (user: typeof alice, message: string) => {
    await run(ops.add(REPO, user.id, undefined));
    return run(ops.commit(REPO, user, { message }));
  };
  const push = (user: typeof alice, branch: string) =>
    run(remote.push(REPO, user.id, { remote: "origin", force: false, branch }));
  const freshClone = async () => {
    const dir = path.join(base, "verify");
    await simpleGit().clone(storage.remotePath(REPO), dir);
    return simpleGit(dir);
  };

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "pr-int-"));
    storage = new RepoStorageService({
      get: (key: string, fallback?: string) =>
        ({
          ENV: "dev",
          REPO_LOCAL_BASE_PATH: path.join(base, "repos"),
          REMOTE_LOCAL_BASE_PATH: path.join(base, "remote"),
        })[key] ?? fallback,
    } as unknown as ConfigService);
    const roles: Record<string, CollaboratorRole> = { bob: "write" };
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
    prs = inMemoryPullRequests();
    service = new PullRequestService(
      workspaces,
      prs.repository,
      branches,
      new GitDiffService(workspaces, storage),
    );

    await run(storage.initialize(REPO, alice.id));
    await write("alice", "same.txt", "base\n");
    await commitAll(alice, "base");
    await push(alice, "main");
    // bob은 feature가 push되기 전에 작업 사본을 받아 둔다 → feature를 전혀 모른다
    await run(ops.status(REPO, bob.id));
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  const openFeaturePr = async (featureContent: string) => {
    await run(branches.create(REPO, alice.id, "feature"));
    await write("alice", "same.txt", featureContent);
    await write("alice", "feature.txt", "feature\n");
    await commitAll(alice, "feature change");
    await push(alice, "feature");
    return run(
      service.create(REPO, alice.id, {
        title: "feature",
        sourceBranch: "feature",
        targetBranch: "main",
      }),
    );
  };

  it("write 권한자는 로컬 feature 브랜치 없이도 PR을 원격에 병합한다", async () => {
    const pr = await openFeaturePr("feature\n");

    const merged = await run(service.merge(REPO, bob, pr.id, false));
    expect(merged.pullRequest).toMatchObject({
      status: "merged",
      mergedBy: "bob",
      mergeCommitHash: merged.to,
    });
    expect(merged.from).not.toBe(merged.to);

    // bob의 작업 사본은 건드리지 않는다
    const bobGit = simpleGit(storage.workingCopyPath(bob.id, REPO));
    expect((await bobGit.branchLocal()).all).toEqual(["main"]);

    const clone = await freshClone();
    expect((await clone.revparse(["origin/main"])).trim()).toBe(merged.to);
    const parents = (
      await clone.raw(["rev-list", "--parents", "-n", "1", merged.to])
    )
      .trim()
      .split(" ");
    expect(parents).toHaveLength(3);
    const author = (
      await clone.raw(["log", "-1", "--format=%ae", merged.to])
    ).trim();
    expect(author).toBe(bob.email);
    expect(
      await fs.readFile(path.join(base, "verify", "feature.txt"), "utf8"),
    ).toBe("feature\n");
  });

  it("충돌하면 409를 돌려주고 원격과 PR 상태를 그대로 둔다", async () => {
    await write("alice", "same.txt", "main\n");
    await commitAll(alice, "main change");
    await push(alice, "main");
    const before = (
      await simpleGit(storage.remotePath(REPO)).revparse(["main"])
    ).trim();
    // main 변경 이후 feature를 main에서 분기하지 않도록 base 커밋에서 분기시킨다
    await run(branches.create(REPO, alice.id, "feature", "HEAD~1"));
    await write("alice", "same.txt", "feature\n");
    await commitAll(alice, "feature change");
    await push(alice, "feature");
    const pr = await run(
      service.create(REPO, alice.id, {
        title: "feature",
        sourceBranch: "feature",
        targetBranch: "main",
      }),
    );

    const conflict = await exit(service.merge(REPO, bob, pr.id, false));
    expect(tagOf(conflict)).toBe("GitConflictError");
    expect(prs.rows.get(pr.id)?.status).toBe("open");
    expect(
      (await simpleGit(storage.remotePath(REPO)).revparse(["main"])).trim(),
    ).toBe(before);
  });

  it("원격에 없는 source 브랜치는 404", async () => {
    await run(branches.create(REPO, alice.id, "local-only"));
    const pr = await run(
      service.create(REPO, alice.id, {
        title: "local",
        sourceBranch: "local-only",
        targetBranch: "main",
      }),
    );
    expect(tagOf(await exit(service.merge(REPO, bob, pr.id, false)))).toBe(
      "GitRefNotFoundError",
    );
    expect(prs.rows.get(pr.id)?.status).toBe("open");
  });
});
