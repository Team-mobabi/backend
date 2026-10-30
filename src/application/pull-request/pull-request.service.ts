import { Injectable } from "@nestjs/common";
import { Effect, Option } from "effect";
import { BranchService } from "@src/application/git/branch.service";
import { GitDiffService } from "@src/application/git/git-diff.service";
import {
  RepoWorkspaceService,
  type WorkspaceError,
} from "@src/application/repo/repo-workspace.service";
import { getOrFail } from "@src/common/effect";
import {
  type DbError,
  type GitOperationError,
  GitRefNotFoundError,
  PullRequestConflictError,
  type PullRequestError,
  PullRequestNotFoundError,
  type RepoError,
} from "@src/common/error";
import type { RepoPath } from "@src/domain/file/repo-path";
import type { FileDiff } from "@src/domain/git/diff";
import type { MergeResult } from "@src/domain/git/git";
import type {
  CreatePullRequestBody,
  CreateReviewBody,
  PullRequest,
  PullRequestStatus,
  Review,
} from "@src/domain/pull-request/pull-request";
import type { User } from "@src/domain/user/user";
import { tryGit } from "@src/infrastructure/git/git";
import { PullRequestRepository } from "@src/infrastructure/repositories/pull-request.repository";

type Failure = PullRequestError | RepoError | DbError;

const notOpen = (message = "Pull request is not open") =>
  new PullRequestConflictError({ message });

@Injectable()
export class PullRequestService {
  constructor(
    private readonly workspaces: RepoWorkspaceService,
    private readonly pullRequests: PullRequestRepository,
    private readonly branches: BranchService,
    private readonly diffs: GitDiffService,
  ) {}

  create(
    repoId: string,
    userId: string,
    body: CreatePullRequestBody,
  ): Effect.Effect<PullRequest, Failure | WorkspaceError> {
    return Effect.gen(this, function* () {
      const { git } = yield* this.workspaces.open(repoId, userId);
      const local = yield* tryGit("branch", () => git.branchLocal());
      for (const [label, name] of [
        ["Source", body.sourceBranch],
        ["Target", body.targetBranch],
      ] as const) {
        if (!local.all.includes(name)) {
          return yield* new GitRefNotFoundError({
            message: `${label} branch '${name}' not found`,
            ref: name,
          });
        }
      }
      if (body.sourceBranch === body.targetBranch) {
        return yield* new PullRequestConflictError({
          message: "Source and target branches cannot be the same",
        });
      }
      const duplicate = yield* this.pullRequests.findOpen(
        repoId,
        body.sourceBranch,
        body.targetBranch,
      );
      if (Option.isSome(duplicate)) {
        return yield* new PullRequestConflictError({
          message: "A pull request already exists for these branches",
        });
      }
      return yield* this.pullRequests.create({
        repoId,
        authorId: userId,
        title: body.title,
        description: body.description ?? null,
        sourceBranch: body.sourceBranch,
        targetBranch: body.targetBranch,
      });
    });
  }

  list(
    repoId: string,
    userId: string,
    status?: PullRequestStatus,
  ): Effect.Effect<readonly PullRequest[], Failure> {
    return this.workspaces
      .authorize(repoId, userId)
      .pipe(Effect.zipRight(this.pullRequests.list(repoId, status)));
  }

  get(
    repoId: string,
    userId: string,
    prId: string,
  ): Effect.Effect<PullRequest, Failure> {
    return this.workspaces.authorize(repoId, userId).pipe(
      Effect.zipRight(this.pullRequests.find(repoId, prId)),
      getOrFail(
        () =>
          new PullRequestNotFoundError({ message: "Pull request not found" }),
      ),
    );
  }

  /** 공유 이력을 바꾸는 작업이므로 write 권한이 필요하다 */
  merge(
    repoId: string,
    merger: User,
    prId: string,
    fastForwardOnly: boolean,
  ): Effect.Effect<
    MergeResult & { pullRequest: PullRequest },
    Failure | WorkspaceError
  > {
    return Effect.gen(this, function* () {
      yield* this.workspaces.authorize(repoId, merger.id, "write");
      const pr = yield* this.get(repoId, merger.id, prId);
      if (pr.status !== "open") return yield* notOpen();
      if (
        pr.requiresApproval &&
        (yield* this.pullRequests.countApprovals(pr.id)) === 0
      ) {
        return yield* new PullRequestConflictError({
          message: "Pull request requires at least one approval before merging",
        });
      }

      // 원격 push까지 성공한 뒤에만 PR을 병합 상태로 바꾼다
      const result = yield* this.branches.mergeOnRemote(repoId, merger, {
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
        fastForwardOnly,
      });
      const pullRequest = yield* this.pullRequests.markMerged(
        pr,
        merger.id,
        result.to,
      );
      return { ...result, pullRequest };
    });
  }

  /** 작성자 본인 또는 write 권한자만 닫을 수 있다 */
  close(
    repoId: string,
    userId: string,
    prId: string,
  ): Effect.Effect<PullRequest, Failure> {
    return Effect.gen(this, function* () {
      const pr = yield* this.get(repoId, userId, prId);
      if (pr.authorId !== userId) {
        yield* this.workspaces.authorize(repoId, userId, "write");
      }
      if (pr.status !== "open") return yield* notOpen();
      return yield* this.pullRequests.markClosed(pr);
    });
  }

  /** 승인이 병합 조건이므로 리뷰는 write 권한자만 남길 수 있다 */
  review(
    repoId: string,
    userId: string,
    prId: string,
    body: CreateReviewBody,
  ): Effect.Effect<Review, Failure> {
    return Effect.gen(this, function* () {
      yield* this.workspaces.authorize(repoId, userId, "write");
      const pr = yield* this.get(repoId, userId, prId);
      if (pr.status !== "open") {
        return yield* notOpen("Cannot review a closed pull request");
      }
      if (pr.authorId === userId) {
        return yield* new PullRequestConflictError({
          message: "Cannot review your own pull request",
        });
      }
      return yield* this.pullRequests.upsertReview(
        pr.id,
        userId,
        body.status,
        body.comment ?? null,
      );
    });
  }

  reviews(
    repoId: string,
    userId: string,
    prId: string,
  ): Effect.Effect<readonly Review[], Failure> {
    return this.get(repoId, userId, prId).pipe(
      Effect.flatMap((pr) => this.pullRequests.listReviews(pr.id)),
    );
  }

  diff(
    repoId: string,
    userId: string,
    prId: string,
    path?: RepoPath,
  ): Effect.Effect<FileDiff[], Failure | GitOperationError> {
    return this.get(repoId, userId, prId).pipe(
      Effect.flatMap((pr) =>
        this.diffs.branchesOnRemote(
          repoId,
          pr.sourceBranch,
          pr.targetBranch,
          path || undefined,
        ),
      ),
    );
  }
}
