import { Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BranchService } from "@src/application/git/branch.service";
import type { GitDiffService } from "@src/application/git/git-diff.service";
import type { RepoWorkspaceService } from "@src/application/repo/repo-workspace.service";
import { RepoAccessDeniedError } from "@src/common/error";
import type { CollaboratorRole } from "@src/domain/repo/collaborator-role";
import { roleSatisfies } from "@src/domain/repo/collaborator-role";
import type { PullRequest } from "@src/domain/pull-request/pull-request";
import type { PullRequestRepository } from "@src/infrastructure/repositories/pull-request.repository";
import { PullRequestService } from "./pull-request.service";

const tagOf = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit) && exit.cause._tag === "Fail"
    ? exit.cause.error._tag
    : undefined;

const makePr = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  id: "pr1",
  title: "feat",
  description: null,
  sourceBranch: "feature",
  targetBranch: "main",
  authorId: "author",
  status: "open",
  mergedAt: null,
  mergedBy: null,
  mergeCommitHash: null,
  requiresApproval: true,
  repoId: "r1",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("PullRequestService 권한/상태", () => {
  let roles: Record<string, CollaboratorRole>;
  let pr: PullRequest;
  let approvals: number;
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let merge: ReturnType<typeof vi.fn>;
  let service: PullRequestService;

  beforeEach(() => {
    roles = { maintainer: "write", reader: "read", author: "read" };
    pr = makePr();
    approvals = 0;
    repo = {
      find: vi.fn(() => Effect.succeed(Option.some(pr))),
      countApprovals: vi.fn(() => Effect.sync(() => approvals)),
      markMerged: vi.fn(() =>
        Effect.sync(() => ({ ...pr, status: "merged" as const })),
      ),
      markClosed: vi.fn(() =>
        Effect.sync(() => ({ ...pr, status: "closed" as const })),
      ),
      upsertReview: vi.fn(() => Effect.succeed({ id: "rv1" })),
    };
    merge = vi.fn(() => Effect.succeed({ to: "abc", success: true }));
    const workspaces = {
      authorize: (
        _repoId: string,
        userId: string,
        required: CollaboratorRole = "read",
      ) =>
        Effect.suspend(() => {
          const role = roles[userId];
          return role && roleSatisfies(role, required)
            ? Effect.succeed({ ownerId: "owner" })
            : Effect.fail(
                new RepoAccessDeniedError({ message: "denied", repoId: "r1" }),
              );
        }),
    };
    service = new PullRequestService(
      workspaces as unknown as RepoWorkspaceService,
      repo as unknown as PullRequestRepository,
      { merge } as unknown as BranchService,
      {} as GitDiffService,
    );
  });

  const run = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromiseExit(effect);

  it("read 권한으로는 병합할 수 없다", async () => {
    approvals = 1;
    expect(tagOf(await run(service.merge("r1", "reader", "pr1", false)))).toBe(
      "RepoAccessDeniedError",
    );
    expect(merge).not.toHaveBeenCalled();
  });

  it("승인이 필요한 PR은 승인 없이 병합할 수 없다", async () => {
    expect(
      tagOf(await run(service.merge("r1", "maintainer", "pr1", false))),
    ).toBe("PullRequestConflictError");

    approvals = 1;
    const merged = await run(service.merge("r1", "maintainer", "pr1", false));
    expect(Exit.isSuccess(merged)).toBe(true);
    expect(repo.markMerged).toHaveBeenCalledWith(pr, "maintainer", "abc");
  });

  it("작성자는 write 권한 없이도 자신의 PR을 닫을 수 있지만, 남의 PR은 못 닫는다", async () => {
    expect(
      Exit.isSuccess(await run(service.close("r1", "author", "pr1"))),
    ).toBe(true);
    expect(tagOf(await run(service.close("r1", "reader", "pr1")))).toBe(
      "RepoAccessDeniedError",
    );
  });

  it("닫힌 PR은 병합/리뷰할 수 없다", async () => {
    pr = makePr({ status: "closed" });
    approvals = 1;
    expect(
      tagOf(await run(service.merge("r1", "maintainer", "pr1", false))),
    ).toBe("PullRequestConflictError");
    expect(
      tagOf(
        await run(
          service.review("r1", "maintainer", "pr1", { status: "approved" }),
        ),
      ),
    ).toBe("PullRequestConflictError");
  });

  it("리뷰는 write 권한이 필요하고 자기 PR은 리뷰할 수 없다", async () => {
    expect(
      tagOf(
        await run(
          service.review("r1", "reader", "pr1", { status: "approved" }),
        ),
      ),
    ).toBe("RepoAccessDeniedError");

    roles.author = "write";
    expect(
      tagOf(
        await run(
          service.review("r1", "author", "pr1", { status: "approved" }),
        ),
      ),
    ).toBe("PullRequestConflictError");

    const ok = await run(
      service.review("r1", "maintainer", "pr1", {
        status: "approved",
        comment: "LGTM",
      }),
    );
    expect(Exit.isSuccess(ok)).toBe(true);
    expect(repo.upsertReview).toHaveBeenCalledWith(
      "pr1",
      "maintainer",
      "approved",
      "LGTM",
    );
  });

  it("다른 레포의 PR이거나 없으면 404", async () => {
    repo.find.mockReturnValueOnce(Effect.succeed(Option.none()));
    expect(tagOf(await run(service.get("r1", "reader", "pr1")))).toBe(
      "PullRequestNotFoundError",
    );
  });
});
