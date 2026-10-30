import { Injectable, Logger } from "@nestjs/common";
import { Effect, Option } from "effect";
import {
  type RepoWorkspace,
  RepoWorkspaceService,
  type WorkspaceError,
} from "@src/application/repo/repo-workspace.service";
import { GitPreconditionError, GitRefNotFoundError } from "@src/common/error";
import type { RepoPath } from "@src/domain/file/repo-path";
import type { CommitBody, ResetMode } from "@src/domain/git/git";
import type { User } from "@src/domain/user/user";
import * as fsx from "@src/infrastructure/file/file-system";
import { currentBranch, headHash, tryGit } from "@src/infrastructure/git/git";

const RESET_DESCRIPTIONS: Record<ResetMode, string> = {
  hard: "Hard reset: {from} → {to} (작업 디렉토리까지 완전히 되돌림)",
  soft: "Soft reset: {from} → {to} (변경사항은 staged 상태로 유지)",
  mixed: "Mixed reset: {from} → {to} (변경사항은 unstaged 상태로 유지)",
};

@Injectable()
export class GitOperationService {
  private readonly logger = new Logger(GitOperationService.name);

  constructor(private readonly workspaces: RepoWorkspaceService) {}

  status(repoId: string, userId: string) {
    return this.withGit(repoId, userId, ({ git }) =>
      Effect.all([
        tryGit("status", () => git.status()),
        // 빈 저장소에서는 ls-files가 실패할 수 있다
        tryGit("ls-files", () => git.raw(["ls-files"])).pipe(
          Effect.map((out) => out.trim().split("\n").filter(Boolean)),
          Effect.orElseSucceed(() => [] as string[]),
        ),
      ]).pipe(
        Effect.map(([st, allFiles]) => ({
          files: [
            ...st.modified.map((name) => ({ name, status: "modified" })),
            ...st.not_added.map((name) => ({ name, status: "untracked" })),
            ...st.created.map((name) => ({ name, status: "added" })),
            ...st.deleted.map((name) => ({ name, status: "deleted" })),
            ...st.renamed.map((r) => ({ name: r.to, status: "renamed" })),
          ],
          allFiles,
          isEmpty: allFiles.length === 0,
        })),
      ),
    );
  }

  add(repoId: string, userId: string, files: readonly RepoPath[] | undefined) {
    return this.withGit(repoId, userId, ({ git, root }) =>
      Effect.gen(function* () {
        if (files && files.length > 0) {
          const missing: string[] = [];
          for (const file of files) {
            const absolute = yield* fsx.resolveInside(root, file);
            if (Option.isNone(yield* fsx.statOption(absolute, file))) {
              missing.push(file);
            }
          }
          if (missing.length > 0) {
            return yield* new GitPreconditionError({
              message: `다음 파일을 찾을 수 없습니다: ${missing.join(", ")}`,
            });
          }
        }
        yield* tryGit("add", () =>
          git.add(files && files.length > 0 ? [...files] : "."),
        );
        const st = yield* tryGit("status", () => git.status());
        return { success: true as const, stagedFiles: st.staged };
      }),
    );
  }

  commit(repoId: string, author: User, body: CommitBody) {
    return this.withGit(repoId, author.id, ({ git }) =>
      Effect.gen(this, function* () {
        if (body.branch) {
          const current = yield* currentBranch(git);
          if (current !== body.branch) {
            const branch = body.branch;
            yield* tryGit("checkout", () => git.checkout(["-B", branch]));
          }
        }

        const authorName = author.email.split("@")[0] || "Unknown";
        const summary = yield* tryGit("commit", () =>
          git.commit(body.message, undefined, {
            "--no-gpg-sign": null,
            "--author": `${authorName} <${author.email}>`,
          }),
        );
        // simple-git은 커밋할 것이 없어도 실패하지 않고 빈 commit을 돌려준다
        if (summary.commit === "") {
          return yield* new GitPreconditionError({
            message: "커밋할 변경사항이 없습니다.",
          });
        }

        const latest = yield* tryGit("log", () => git.log({ maxCount: 1 }));
        const head = latest.latest;
        if (head === null) {
          return yield* new GitRefNotFoundError({
            message: "커밋 정보를 가져올 수 없습니다.",
            ref: "HEAD",
          });
        }
        this.logger.debug(`Commit 성공: ${head.hash} (repoId=${repoId})`);
        return {
          success: true as const,
          commitHash: head.hash,
          message: head.message,
          committedAt: head.date,
          stats: summary.summary,
        };
      }),
    );
  }

  reset(repoId: string, userId: string, commitHash: string, mode: ResetMode) {
    return this.withGit(repoId, userId, ({ git }) =>
      Effect.gen(function* () {
        yield* tryGit("rev-parse", () =>
          git.revparse(["--verify", `${commitHash}^{commit}`]),
        ).pipe(
          Effect.mapError(
            () =>
              new GitRefNotFoundError({
                message: `커밋 '${commitHash}'를 찾을 수 없습니다.`,
                ref: commitHash,
              }),
          ),
        );
        const from = yield* headHash(git);
        const branch = yield* currentBranch(git);
        yield* tryGit("reset", () => git.reset([`--${mode}`, commitHash]));
        const to = yield* headHash(git);
        const st = yield* tryGit("status", () => git.status());
        return {
          success: true as const,
          mode,
          from,
          to,
          branch,
          modified: st.modified,
          staged: st.staged,
          message: RESET_DESCRIPTIONS[mode]
            .replace("{from}", from.slice(0, 7))
            .replace("{to}", to.slice(0, 7)),
        };
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
