import { Injectable, Logger } from "@nestjs/common";
import { Effect, Option } from "effect";
import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import {
  type RepoWorkspace,
  RepoWorkspaceService,
  type WorkspaceError,
} from "@src/application/repo/repo-workspace.service";
import {
  GitConflictError,
  type GitOperationError,
  GitPreconditionError,
  GitRefNotFoundError,
} from "@src/common/error";
import type {
  PullBody,
  PullResult,
  PushBody,
  PushResult,
} from "@src/domain/git/git";
import { ensureDir, statOption } from "@src/infrastructure/file/file-system";
import {
  currentBranch,
  gitErrorMessage,
  headHash,
  recoverGit,
  tryGit,
} from "@src/infrastructure/git/git";
import { RepoStorageService } from "@src/infrastructure/git/repo-storage.service";

/** 이미 최신이면 기존 API처럼 204로 응답한다 */
export type PullOutcome = PullResult | { readonly upToDate: true };

@Injectable()
export class GitRemoteService {
  private readonly logger = new Logger(GitRemoteService.name);

  constructor(
    private readonly workspaces: RepoWorkspaceService,
    private readonly storage: RepoStorageService,
  ) {}

  pull(
    repoId: string,
    userId: string,
    body: PullBody,
  ): Effect.Effect<PullOutcome, WorkspaceError> {
    return this.withGit(repoId, userId, "read", ({ git }) =>
      Effect.gen(this, function* () {
        yield* this.assertClean(git);
        const branch = body.branch ?? (yield* currentBranch(git));
        yield* this.assertRemote(git, body.remote);
        yield* this.assertRemoteBranch(git, body.remote, branch);

        yield* tryGit("fetch", () => git.fetch(body.remote, branch));
        const from = yield* headHash(git);
        const remoteHash = (yield* tryGit("rev-parse", () =>
          git.revparse([`${body.remote}/${branch}`]),
        )).trim();
        if (from === remoteHash) return { upToDate: true as const };

        const isAncestor = yield* tryGit("merge-base", () =>
          git.raw(["merge-base", "--is-ancestor", from, remoteHash]),
        ).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        );
        if (body.ffOnly && !isAncestor) {
          return yield* new GitConflictError({
            message: "Fast-forward merge is not possible",
          });
        }

        yield* tryGit("pull", () =>
          git.pull(
            body.remote,
            branch,
            body.ffOnly ? { "--ff-only": null } : {},
          ),
        ).pipe(
          // 병합 충돌은 실패가 아니라 hasConflict로 응답한다
          Effect.catchIf(
            (error) =>
              /merge conflict|CONFLICT/i.test(
                gitErrorMessage(error.originalError),
              ),
            () => Effect.void,
          ),
          Effect.catchIf(
            (error) =>
              /would be overwritten|needs merge/i.test(
                gitErrorMessage(error.originalError),
              ),
            () =>
              tryGit("status", () => git.status()).pipe(
                Effect.flatMap((st) =>
                  Effect.fail(
                    new GitConflictError({
                      message: "로컬 변경사항과 충돌이 발생했습니다",
                      details: {
                        error: "Pull Conflict",
                        localChanges: [...st.modified, ...st.created],
                        resolution:
                          "로컬 변경사항을 커밋하거나 stash한 후 다시 시도해주세요",
                      },
                    }),
                  ),
                ),
              ),
          ),
        );

        const st = yield* tryGit("status", () => git.status());
        return {
          success: true as const,
          fastForward: isAncestor,
          from,
          to: yield* headHash(git),
          hasConflict: st.conflicted.length > 0,
          conflictFiles: st.conflicted,
        };
      }),
    );
  }

  /** 공유 원격을 변경하므로 write 권한이 필요하다 */
  push(
    repoId: string,
    userId: string,
    body: PushBody,
  ): Effect.Effect<PushResult, WorkspaceError> {
    return this.withGit(repoId, userId, "write", ({ git }) =>
      Effect.gen(this, function* () {
        const branch = body.branch ?? (yield* currentBranch(git));
        yield* this.assertRemote(git, body.remote);
        yield* tryGit("rev-parse", () =>
          git.raw(["rev-parse", "--verify", branch]),
        ).pipe(
          Effect.mapError(
            () =>
              new GitRefNotFoundError({
                message: `브랜치 '${branch}'를 찾을 수 없습니다.`,
                ref: branch,
              }),
          ),
        );

        const remoteRef = `${body.remote}/${branch}`;
        const remoteExists = yield* tryGit("rev-parse", () =>
          git.raw(["rev-parse", "--verify", remoteRef]),
        ).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        );
        const ahead = remoteExists
          ? yield* tryGit("rev-list", () =>
              git.raw([
                "rev-list",
                "--left-right",
                "--count",
                `${remoteRef}...HEAD`,
              ]),
            ).pipe(Effect.map((out) => Number(out.trim().split("\t")[1] ?? 0)))
          : 0;

        if (!body.force && remoteExists && ahead === 0) {
          return { success: true as const, upToDate: true, pushed: [] };
        }

        this.logger.debug(
          `Push: repoId=${repoId}, ${body.remote}/${branch}, ahead=${ahead}, force=${body.force}`,
        );
        const result = yield* tryGit("push", () =>
          git.push(body.remote, branch, body.force ? ["--force"] : []),
        ).pipe(
          Effect.catchIf(
            (error) =>
              /no upstream branch|set-upstream/i.test(
                gitErrorMessage(error.originalError),
              ),
            () =>
              tryGit("push", () =>
                git.push(body.remote, branch, ["--set-upstream"]),
              ),
          ),
          recoverGit(rejectedPush),
        );

        return {
          success: true as const,
          upToDate: false,
          pushed: result.pushed.map((entry) => ({ ...entry })),
        };
      }),
    );
  }

  addRemote(repoId: string, userId: string, url: string, name: string) {
    return this.withGit(repoId, userId, "read", ({ git }) =>
      this.setRemote(git, name, url),
    );
  }

  /** 작업 사본의 리모트를 이 레포의 공유 원격으로 (재)연결 */
  connectLocalRemote(repoId: string, userId: string, name: string) {
    const remotePath = this.storage.remotePath(repoId);
    return this.withGit(repoId, userId, "read", ({ git }) =>
      statOption(remotePath, repoId).pipe(
        Effect.flatMap((stats) =>
          Option.isSome(stats)
            ? Effect.void
            : ensureDir(remotePath, repoId).pipe(
                Effect.zipRight(
                  tryGit("init", () => simpleGit(remotePath).init(true)),
                ),
                Effect.asVoid,
              ),
        ),
        Effect.zipRight(this.setRemote(git, name, remotePath)),
        Effect.as({
          success: true as const,
          remotePath,
          remoteName: name,
        }),
      ),
    );
  }

  private setRemote(
    git: SimpleGit,
    name: string,
    url: string,
  ): Effect.Effect<void, GitOperationError> {
    return tryGit("remote", () => git.getRemotes()).pipe(
      Effect.flatMap((remotes) =>
        remotes.some((remote) => remote.name === name)
          ? tryGit("remote set-url", () => git.remote(["set-url", name, url]))
          : tryGit("remote add", () => git.addRemote(name, url)),
      ),
      Effect.asVoid,
    );
  }

  private assertClean(git: SimpleGit) {
    return tryGit("status", () => git.status()).pipe(
      Effect.flatMap((st) => {
        const changes = [...st.modified, ...st.created, ...st.deleted];
        return changes.length === 0
          ? Effect.void
          : Effect.fail(
              new GitPreconditionError({
                message: "커밋되지 않은 변경사항이 있습니다",
                details: {
                  error: "Uncommitted Changes",
                  changes,
                  resolution:
                    "변경사항을 커밋하거나 stash한 후 다시 시도해주세요",
                },
              }),
            );
      }),
    );
  }

  private assertRemote(git: SimpleGit, remote: string) {
    return tryGit("remote", () => git.getRemotes()).pipe(
      Effect.filterOrFail(
        (remotes) => remotes.some((r) => r.name === remote),
        () =>
          new GitPreconditionError({
            message: `리모트 '${remote}'가 설정되지 않았습니다.`,
          }),
      ),
      Effect.asVoid,
    );
  }

  private assertRemoteBranch(git: SimpleGit, remote: string, branch: string) {
    return tryGit("ls-remote", () =>
      git.raw(["ls-remote", "--heads", remote, branch]),
    ).pipe(
      Effect.filterOrFail(
        (refs) => refs.trim() !== "",
        () =>
          new GitConflictError({
            message:
              "Remote repository is empty or branch does not exist. Please add, commit, and push first.",
          }),
      ),
      Effect.asVoid,
    );
  }

  private withGit<A, E>(
    repoId: string,
    userId: string,
    role: "read" | "write",
    use: (workspace: RepoWorkspace) => Effect.Effect<A, E>,
  ): Effect.Effect<A, E | WorkspaceError> {
    return this.workspaces.open(repoId, userId, role).pipe(Effect.flatMap(use));
  }
}

const rejectedPush = (message: string): GitConflictError | undefined => {
  if (!/rejected|non-fast-forward/i.test(message)) return undefined;
  // "(fetch first)"도 원격에 로컬에 없는 커밋이 있다는 뜻이라 non-fast-forward로 본다
  const nonFastForward = /non-fast-forward|fetch first/i.test(message);
  return new GitConflictError({
    message: "Push가 거부되었습니다",
    details: {
      error: "Push Rejected",
      reason: nonFastForward ? "non-fast-forward" : "rejected",
      hint: nonFastForward
        ? "원격 저장소를 먼저 pull한 후 다시 시도하세요"
        : "원격 저장소 권한을 확인하세요",
      resolution: nonFastForward
        ? "원격 저장소의 변경사항을 먼저 pull한 후 push해주세요"
        : "원격 저장소 상태를 확인해주세요",
    },
  });
};
