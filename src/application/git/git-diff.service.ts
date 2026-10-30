import { Injectable } from "@nestjs/common";
import { Effect } from "effect";
import simpleGit, { type SimpleGit } from "simple-git";
import {
  type RepoWorkspace,
  RepoWorkspaceService,
  type WorkspaceError,
} from "@src/application/repo/repo-workspace.service";
import type { GitOperationError } from "@src/common/error";
import {
  type ChangedFile,
  type DiffStats,
  type FileDiff,
  parseDiffOutput,
  parseNameStatus,
  parseNumstat,
} from "@src/domain/git/diff";
import { tryGit } from "@src/infrastructure/git/git";
import { RepoStorageService } from "@src/infrastructure/git/repo-storage.service";

/** 경로 필터는 "--" 뒤에 두어 ref로 해석되지 않게 한다 */
const withPath = (args: string[], path?: string): string[] =>
  path ? [...args, "--", path] : args;

// git의 빈 트리 해시. 부모가 없는 첫 커밋은 이것과 비교한다
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** commitA만 있으면 그 커밋의 변경사항(부모와 비교) */
const range = (
  git: SimpleGit,
  commitA?: string,
  commitB?: string,
): Effect.Effect<string[], GitOperationError> => {
  if (commitA && commitB) return Effect.succeed([commitA, commitB]);
  if (!commitA) return Effect.succeed([]);
  return tryGit("rev-parse", () =>
    git.revparse(["--verify", `${commitA}^`]),
  ).pipe(
    Effect.as(`${commitA}^`),
    Effect.orElseSucceed(() => EMPTY_TREE),
    Effect.map((parent) => [parent, commitA]),
  );
};

@Injectable()
export class GitDiffService {
  constructor(
    private readonly workspaces: RepoWorkspaceService,
    private readonly storage: RepoStorageService,
  ) {}

  working(repoId: string, userId: string, path?: string) {
    return this.diff(repoId, userId, withPath([], path));
  }

  staged(repoId: string, userId: string, path?: string) {
    return this.diff(repoId, userId, withPath(["--cached"], path));
  }

  between(
    repoId: string,
    userId: string,
    commitA: string,
    commitB: string,
    path?: string,
  ) {
    return this.diff(repoId, userId, withPath([commitA, commitB], path));
  }

  branches(
    repoId: string,
    userId: string,
    source: string,
    target: string,
    path?: string,
  ) {
    return this.diff(repoId, userId, withPath([target, source], path));
  }

  commit(repoId: string, userId: string, hash: string, path?: string) {
    return this.withGit(repoId, userId, ({ git }) =>
      range(git, hash).pipe(
        Effect.flatMap((args) =>
          tryGit("diff", () => git.diff(withPath(args, path))),
        ),
        Effect.map(parseDiffOutput),
      ),
    );
  }

  changedFiles(
    repoId: string,
    userId: string,
    commitA?: string,
    commitB?: string,
  ): Effect.Effect<ChangedFile[], WorkspaceError> {
    return this.withGit(repoId, userId, ({ git }) =>
      range(git, commitA, commitB).pipe(
        Effect.flatMap((args) =>
          tryGit("diff", () => git.diff(["--name-status", ...args])),
        ),
        Effect.map(parseNameStatus),
      ),
    );
  }

  stats(
    repoId: string,
    userId: string,
    commitA?: string,
    commitB?: string,
  ): Effect.Effect<DiffStats, WorkspaceError> {
    return this.withGit(repoId, userId, ({ git }) =>
      range(git, commitA, commitB).pipe(
        Effect.flatMap((args) =>
          tryGit("diff", () => git.diff(["--numstat", ...args])),
        ),
        Effect.map(parseNumstat),
      ),
    );
  }

  /**
   * PR용: 사용자 작업 사본이 아니라 공유 bare 저장소에서 직접 비교한다.
   * 권한 확인은 호출하는 쪽(PR 서비스) 책임이다.
   */
  branchesOnRemote(
    repoId: string,
    source: string,
    target: string,
    path?: string,
  ): Effect.Effect<FileDiff[], GitOperationError> {
    const git = simpleGit(this.storage.remotePath(repoId));
    return tryGit("diff", () =>
      git.diff(withPath([target, source], path)),
    ).pipe(Effect.map(parseDiffOutput));
  }

  private diff(
    repoId: string,
    userId: string,
    args: string[],
  ): Effect.Effect<FileDiff[], WorkspaceError> {
    return this.withGit(repoId, userId, ({ git }) =>
      tryGit("diff", () => git.diff(args)).pipe(Effect.map(parseDiffOutput)),
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
