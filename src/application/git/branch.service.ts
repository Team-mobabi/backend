import { Injectable } from "@nestjs/common";
import { Effect } from "effect";
import type { DefaultLogFields, SimpleGit } from "simple-git";
import {
  type RepoWorkspace,
  RepoWorkspaceService,
  type WorkspaceError,
} from "@src/application/repo/repo-workspace.service";
import { GitConflictError, GitRefNotFoundError } from "@src/common/error";
import {
  LOG_FORMAT,
  buildCommitGraph,
  parseLog,
} from "@src/domain/git/commit-graph";
import type { MergeBranchBody, MergeResult } from "@src/domain/git/git";
import type { User } from "@src/domain/user/user";
import {
  currentBranch,
  headHash,
  recoverGit,
  tryGit,
} from "@src/infrastructure/git/git";
import { RepoStorageService } from "@src/infrastructure/git/repo-storage.service";

const REMOTE_PREFIX = "remotes/origin/";

@Injectable()
export class BranchService {
  constructor(
    private readonly workspaces: RepoWorkspaceService,
    private readonly storage: RepoStorageService,
  ) {}

  list(repoId: string, userId: string, limit: number) {
    return this.withGit(repoId, userId, ({ git }) =>
      Effect.gen(function* () {
        const local = yield* tryGit("branch", () => git.branchLocal());
        const branches = yield* Effect.forEach(
          local.all,
          (name) =>
            tryGit("log", () =>
              git.log<DefaultLogFields>([
                name,
                `--max-count=${limit}`,
                "--reverse",
              ]),
            ).pipe(
              Effect.map((log) => ({
                name,
                pushedCommits: log.all.map((c) => ({
                  hash: c.hash.slice(0, 7),
                  message: c.message,
                  author: c.author_name,
                  committedAt: c.date,
                })),
                isCurrent: name === local.current,
              })),
            ),
          { concurrency: 4 },
        );
        return { branches, currentBranch: local.current };
      }),
    );
  }

  create(repoId: string, userId: string, name: string, from?: string) {
    return this.withGit(repoId, userId, ({ git }) =>
      tryGit("checkout -b", () =>
        git.checkout(["-b", name, ...(from ? [from] : [])]),
      ).pipe(
        recoverGit((message) => {
          if (/already exists/i.test(message)) {
            return new GitConflictError({
              message: `Branch '${name}' already exists.`,
            });
          }
          if (
            from &&
            /is not a commit|not a valid|invalid reference/i.test(message)
          ) {
            return new GitRefNotFoundError({
              message: `Base branch '${from}' does not exist.`,
              ref: from,
            });
          }
          return undefined;
        }),
        Effect.zipRight(Effect.all([currentBranch(git), headHash(git)])),
        Effect.map(([current, commit]) => ({
          success: true as const,
          message: `Branch '${name}' created.`,
          branchName: name,
          currentBranch: current,
          currentCommit: commit,
          baseBranch: from ?? null,
        })),
      ),
    );
  }

  switch(repoId: string, userId: string, name: string) {
    return this.withGit(repoId, userId, ({ git }) =>
      tryGit("checkout", () => git.checkout(name)).pipe(
        recoverGit((message) => {
          if (/pathspec.*did not match/i.test(message)) {
            return new GitRefNotFoundError({
              message: `Branch '${name}' does not exist.`,
              ref: name,
            });
          }
          if (/Please commit your changes/i.test(message)) {
            return new GitConflictError({
              message:
                "You have uncommitted changes. Please commit or stash them before switching branches.",
            });
          }
          return undefined;
        }),
        Effect.zipRight(currentBranch(git)),
        Effect.map((current) => ({
          success: true as const,
          currentBranch: current,
        })),
      ),
    );
  }

  delete(repoId: string, userId: string, name: string) {
    return this.withGit(repoId, userId, ({ git }) =>
      tryGit("branch -D", () => git.deleteLocalBranch(name, true)).pipe(
        recoverGit((message) => {
          if (/not found/i.test(message)) {
            return new GitRefNotFoundError({
              message: `Branch '${name}' does not exist.`,
              ref: name,
            });
          }
          if (/cannot delete.*(checked out|used by worktree)/i.test(message)) {
            return new GitConflictError({
              message:
                "Cannot delete the currently checked out branch. Please switch to another branch first.",
            });
          }
          return undefined;
        }),
        Effect.as({
          success: true as const,
          message: `Branch '${name}' deleted.`,
        }),
      ),
    );
  }

  /** 항상 --no-ff 3-way merge. 충돌이 나면 작업 사본을 충돌 상태로 남겨 충돌 해결 API로 이어간다 */
  merge(
    repoId: string,
    userId: string,
    body: MergeBranchBody,
  ): Effect.Effect<MergeResult, WorkspaceError> {
    return this.withGit(repoId, userId, ({ git }) =>
      Effect.gen(function* () {
        const before = yield* tryGit("status", () => git.status());
        if (before.conflicted.length > 0) {
          return yield* new GitConflictError({
            message: `이미 해결되지 않은 충돌이 있습니다. 충돌을 먼저 해결하거나 merge를 중단하세요. 충돌 파일: ${before.conflicted.join(", ")}`,
          });
        }

        const current = yield* currentBranch(git);
        const target = body.targetBranch ?? current;
        if (current !== target) {
          yield* tryGit("checkout", () => git.checkout(target)).pipe(
            recoverGit((message) =>
              /pathspec.*did not match/i.test(message)
                ? new GitRefNotFoundError({
                    message: `타겟 브랜치 '${target}'를 찾을 수 없습니다.`,
                    ref: target,
                  })
                : undefined,
            ),
          );
        }
        if (body.fastForwardOnly) {
          return yield* new GitConflictError({
            message: "Fast-forward merge is not allowed. Use 3-way merge only.",
          });
        }

        const from = yield* headHash(git);
        yield* tryGit("merge", () =>
          git.merge([body.sourceBranch, "--no-ff"]),
        ).pipe(
          recoverGit((message) => {
            if (/merge conflict|CONFLICT/i.test(message)) {
              return new GitConflictError({
                message:
                  "Merge conflict detected. Please resolve conflicts manually.",
              });
            }
            if (/not something we can merge/i.test(message)) {
              return new GitRefNotFoundError({
                message: `Branch '${body.sourceBranch}' does not exist.`,
                ref: body.sourceBranch,
              });
            }
            return undefined;
          }),
        );
        const to = yield* headHash(git);
        const after = yield* tryGit("status", () => git.status());

        return {
          success: true as const,
          // 기존 API 호환: HEAD가 움직였는지 여부
          fastForward: from !== to,
          from,
          to,
          sourceBranch: body.sourceBranch,
          targetBranch: target,
          hasConflict: after.conflicted.length > 0,
          conflictFiles: after.conflicted,
        };
      }),
    );
  }

  /**
   * 공유 원격의 source를 target에 --no-ff로 병합하고 target을 원격에 push한다.
   * 병합자의 작업 사본 대신 원격의 임시 clone에서 수행하므로 병합자가 source 브랜치를
   * 로컬에 갖고 있지 않아도 되고, 충돌 시에는 아무것도 push하지 않아 원격이 반쯤 병합된 상태로 남지 않는다.
   */
  mergeOnRemote(
    repoId: string,
    merger: User,
    body: {
      readonly sourceBranch: string;
      readonly targetBranch: string;
      readonly fastForwardOnly: boolean;
    },
  ): Effect.Effect<MergeResult, WorkspaceError> {
    const { sourceBranch, targetBranch } = body;
    const refNotFound = (name: string) =>
      new GitRefNotFoundError({
        message: `Branch '${name}' does not exist on the remote.`,
        ref: name,
      });
    const verify = (git: SimpleGit, name: string) =>
      tryGit("rev-parse", () =>
        git.raw(["rev-parse", "--verify", `refs/remotes/origin/${name}`]),
      ).pipe(Effect.mapError(() => refNotFound(name)));

    return this.workspaces.authorize(repoId, merger.id, "write").pipe(
      Effect.zipRight(
        body.fastForwardOnly
          ? Effect.fail(
              new GitConflictError({
                message:
                  "Fast-forward merge is not allowed. Use 3-way merge only.",
              }),
            )
          : Effect.void,
      ),
      Effect.zipRight(
        this.storage.withScratchClone(repoId, (git) =>
          Effect.gen(function* () {
            yield* verify(git, sourceBranch);
            yield* verify(git, targetBranch);
            yield* tryGit("checkout", () =>
              git.checkout(["-B", targetBranch, `origin/${targetBranch}`]),
            );
            const from = yield* headHash(git);

            // 임시 clone이므로 병합 커밋 작성자를 로컬 설정으로 지정해도 남지 않는다
            const name = merger.email.split("@")[0] || "Unknown";
            yield* tryGit("config", () => git.addConfig("user.name", name));
            yield* tryGit("config", () =>
              git.addConfig("user.email", merger.email),
            );
            // raw()는 충돌(stdout만 출력)을 실패로 보지 않으므로 merge()를 써야 한다
            yield* tryGit("merge", () =>
              git.merge([
                "--no-ff",
                "-m",
                `Merge branch '${sourceBranch}' into ${targetBranch}`,
                `origin/${sourceBranch}`,
              ]),
            ).pipe(
              recoverGit((message) =>
                /merge conflict|CONFLICT/i.test(message)
                  ? new GitConflictError({
                      message:
                        "Merge conflict detected. Resolve conflicts in the source branch and push again.",
                    })
                  : undefined,
              ),
            );
            const to = yield* headHash(git);

            if (to !== from) {
              yield* tryGit("push", () =>
                git.push("origin", `HEAD:refs/heads/${targetBranch}`),
              ).pipe(
                // 병합하는 사이 다른 사용자가 target을 갱신한 경우
                recoverGit((message) =>
                  /rejected|non-fast-forward|fetch first/i.test(message)
                    ? new GitConflictError({
                        message: `Target branch '${targetBranch}' was updated during the merge. Please try again.`,
                      })
                    : undefined,
                ),
              );
            }

            return {
              success: true as const,
              // 기존 API 호환: target이 움직였는지 여부
              fastForward: from !== to,
              from,
              to,
              sourceBranch,
              targetBranch,
              hasConflict: false,
              conflictFiles: [],
            };
          }),
        ),
      ),
    );
  }

  graph(repoId: string, userId: string, max: number, since?: string) {
    return this.withGit(repoId, userId, ({ git }) =>
      Effect.gen(function* () {
        const summary = yield* tryGit("branch -a", () => git.branch(["-a"]));
        const local: Record<string, string> = {};
        const remote: Record<string, string> = {};
        for (const [name, branch] of Object.entries(summary.branches)) {
          if (name.startsWith(REMOTE_PREFIX)) {
            remote[name.slice(REMOTE_PREFIX.length)] = branch.commit;
          } else if (!name.startsWith("remotes/")) {
            local[name] = branch.commit;
          }
        }

        const refs = [
          ...Object.keys(local),
          ...Object.keys(remote).map((name) => `${REMOTE_PREFIX}${name}`),
        ];
        // 브랜치가 없으면(빈 저장소) git log가 실패하므로 빈 그래프를 돌려준다
        const raw =
          refs.length === 0
            ? ""
            : yield* tryGit("log", () =>
                git.raw([
                  "log",
                  ...refs,
                  "--date-order",
                  `--max-count=${max}`,
                  `--pretty=${LOG_FORMAT}`,
                  ...(since ? [`^${since}`] : []),
                ]),
              );
        return buildCommitGraph(parseLog(raw), local, remote, summary.current);
      }),
    );
  }

  private withGit<A, E>(
    repoId: string,
    userId: string,
    use: (workspace: RepoWorkspace) => Effect.Effect<A, E>,
  ): Effect.Effect<A, E | WorkspaceError> {
    return this.workspaces.open(repoId, userId).pipe(Effect.flatMap(use));
  }
}
