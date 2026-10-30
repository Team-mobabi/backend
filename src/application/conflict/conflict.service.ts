import { Injectable } from "@nestjs/common";
import { Effect } from "effect";
import { ConflictResolverService } from "@src/application/ai/conflict-resolver.service";
import {
  type RepoWorkspace,
  RepoWorkspaceService,
  type WorkspaceError,
} from "@src/application/repo/repo-workspace.service";
import { type AiError, GitPreconditionError } from "@src/common/error";
import type { ResolveConflictBody } from "@src/domain/conflict/conflict";
import type { RepoPath } from "@src/domain/file/repo-path";
import * as fsx from "@src/infrastructure/file/file-system";
import { recoverGit, tryGit } from "@src/infrastructure/git/git";

const CONFLICT_START = "<<<<<<< HEAD";

@Injectable()
export class ConflictService {
  constructor(
    private readonly workspaces: RepoWorkspaceService,
    private readonly resolver: ConflictResolverService,
  ) {}

  list(repoId: string, userId: string) {
    return this.withGit(repoId, userId, ({ git }) =>
      this.conflicted(git).pipe(
        Effect.map((conflictFiles) => ({
          hasConflict: conflictFiles.length > 0,
          conflictFiles,
          ...(conflictFiles.length > 0 && {
            message: `${conflictFiles.length}개 파일에서 충돌이 발생했습니다`,
          }),
        })),
      ),
    );
  }

  resolve(repoId: string, userId: string, body: ResolveConflictBody) {
    return this.withGit(repoId, userId, ({ git, root }) =>
      Effect.gen(this, function* () {
        const file = body.filePath;
        if (!(yield* this.conflicted(git)).includes(file)) {
          return yield* new GitPreconditionError({
            message: `'${file}'은(는) 충돌 상태인 파일이 아닙니다`,
          });
        }
        if (body.resolution === "manual") {
          const absolute = yield* fsx.resolveInside(root, file);
          yield* fsx.writeFile(absolute, file, body.manualContent);
        } else {
          const side = body.resolution === "ours" ? "--ours" : "--theirs";
          // "--" 뒤에 경로를 두어 옵션으로 해석되지 않게 한다
          yield* tryGit("checkout", () => git.checkout([side, "--", file]));
        }
        yield* tryGit("add", () => git.add(file));

        const remaining = yield* this.conflicted(git);
        return {
          success: true as const,
          message:
            remaining.length === 0
              ? "모든 충돌이 해결되었습니다. 이제 커밋할 수 있습니다."
              : `파일 충돌이 해결되었습니다. 남은 충돌 파일: ${remaining.join(", ")}`,
        };
      }),
    );
  }

  abortMerge(repoId: string, userId: string) {
    return this.withGit(repoId, userId, ({ git }) =>
      tryGit("merge --abort", () => git.merge(["--abort"])).pipe(
        recoverGit((message) =>
          /no merge to abort|MERGE_HEAD missing/i.test(message)
            ? new GitPreconditionError({ message: "진행 중인 병합이 없습니다" })
            : undefined,
        ),
        Effect.as({
          success: true as const,
          message: "병합이 취소되었습니다",
        }),
      ),
    );
  }

  aiSuggest(
    repoId: string,
    userId: string,
    filePath: RepoPath,
  ): Effect.Effect<
    {
      success: true;
      suggestion: string;
      explanation: string;
      confidence: number;
    },
    WorkspaceError | AiError
  > {
    return this.withGit(repoId, userId, ({ root }) =>
      Effect.gen(this, function* () {
        const absolute = yield* fsx.resolveInside(root, filePath);
        const content = (yield* fsx.readFile(absolute, filePath)).toString(
          "utf8",
        );
        if (!content.includes(CONFLICT_START)) {
          return yield* new GitPreconditionError({
            message: "이 파일에는 충돌 마커가 없습니다",
          });
        }
        const result = yield* this.resolver.suggest(content, filePath);
        return {
          success: true as const,
          suggestion: result.resolvedCode,
          explanation: result.explanation,
          confidence: result.confidence,
        };
      }),
    );
  }

  private conflicted(git: RepoWorkspace["git"]) {
    return tryGit("status", () => git.status()).pipe(
      Effect.map((status) => status.conflicted),
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
