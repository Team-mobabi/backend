import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Effect } from "effect";
import simpleGit, { type SimpleGit } from "simple-git";
import {
  type FileError,
  FileSystemError,
  type GitError,
} from "@src/common/error";
import { ensureDir, remove } from "@src/infrastructure/file/file-system";
import { tryGit } from "./git";

const DEFAULT_BRANCH = "main";

/**
 * 디스크 상의 저장소 배치를 한 곳에서 관리한다.
 * - 원격(bare): {remoteBase}/{repoId}.git
 * - 사용자별 작업 사본: {repoBase}/{userId}/{repoId}
 */
@Injectable()
export class RepoStorageService {
  private readonly logger = new Logger(RepoStorageService.name);
  private readonly repoBasePath: string;
  private readonly remoteBasePath: string;

  constructor(configService: ConfigService) {
    const isProd = configService.get<string>("ENV", "dev") === "prod";
    this.repoBasePath = path.resolve(
      configService.get<string>(
        isProd ? "REPO_BASE_PATH" : "REPO_LOCAL_BASE_PATH",
        "data/repos",
      ),
    );
    this.remoteBasePath = path.resolve(
      configService.get<string>(
        isProd ? "REMOTE_BASE_PATH" : "REMOTE_LOCAL_BASE_PATH",
        "data/remote",
      ),
    );
  }

  remotePath(repoId: string): string {
    return path.join(this.remoteBasePath, `${repoId}.git`);
  }

  workingCopyPath(userId: string, repoId: string): string {
    return path.join(this.repoBasePath, userId, repoId);
  }

  /** bare 원격과 소유자 작업 사본을 만들고 빈 초기 커밋을 push 가능한 상태로 둔다 */
  initialize(
    repoId: string,
    ownerId: string,
  ): Effect.Effect<void, GitError | FileError> {
    const remote = this.remotePath(repoId);
    const workingCopy = this.workingCopyPath(ownerId, repoId);
    const git = () => simpleGit(workingCopy);

    return Effect.all([
      ensureDir(remote, repoId),
      ensureDir(workingCopy, repoId),
    ]).pipe(
      Effect.zipRight(
        tryGit("init", () =>
          simpleGit(remote).init(true, { "--initial-branch": DEFAULT_BRANCH }),
        ),
      ),
      Effect.zipRight(
        tryGit("init", () =>
          git().init(false, { "--initial-branch": DEFAULT_BRANCH }),
        ),
      ),
      Effect.zipRight(this.disableSigning(workingCopy)),
      Effect.zipRight(
        tryGit("remote add", () => git().addRemote("origin", remote)),
      ),
      Effect.zipRight(
        tryGit("commit", () =>
          git().commit("Initial commit", undefined, {
            "--allow-empty": null,
            "--no-gpg-sign": null,
          }),
        ),
      ),
      Effect.asVoid,
    );
  }

  /** 원격을 mirror로 복제하고, 원본의 모든 브랜치를 로컬 브랜치로 만든다 */
  fork(
    sourceRepoId: string,
    repoId: string,
    userId: string,
  ): Effect.Effect<void, GitError | FileError> {
    const remote = this.remotePath(repoId);
    const workingCopy = this.workingCopyPath(userId, repoId);

    return Effect.gen(this, function* () {
      yield* ensureDir(path.dirname(remote), repoId);
      // IMPORTANT: --mirror여야 원본의 모든 브랜치/태그가 복사된다
      yield* tryGit("clone --mirror", () =>
        simpleGit().clone(this.remotePath(sourceRepoId), remote, ["--mirror"]),
      );
      yield* this.cloneWorkingCopy(repoId, userId);

      const git = simpleGit(workingCopy);
      const remoteBranches = yield* tryGit("branch -r", () =>
        git.branch(["-r"]),
      );
      // 한 번도 push되지 않은 원본은 브랜치가 없어 HEAD도 없다
      if (remoteBranches.all.length === 0) return;

      const current = (yield* tryGit("rev-parse", () =>
        git.revparse(["--abbrev-ref", "HEAD"]),
      )).trim();

      for (const remoteBranch of remoteBranches.all) {
        const local = remoteBranch.replace(/^origin\//, "");
        if (
          local === remoteBranch ||
          local.startsWith("HEAD") ||
          local === current
        ) {
          continue;
        }
        yield* tryGit("checkout -b", () =>
          git.checkout(["-b", local, remoteBranch]),
        ).pipe(
          Effect.catchAll((error) =>
            Effect.sync(() =>
              this.logger.warn(
                `Fork 로컬 브랜치 생성 실패 (${local}): ${String(error.originalError)}`,
              ),
            ),
          ),
        );
      }
      yield* tryGit("checkout", () => git.checkout(current));
    });
  }

  cloneWorkingCopy(
    repoId: string,
    userId: string,
  ): Effect.Effect<string, GitError | FileError> {
    const workingCopy = this.workingCopyPath(userId, repoId);
    return ensureDir(path.dirname(workingCopy), repoId).pipe(
      Effect.zipRight(
        tryGit("clone", () =>
          simpleGit().clone(this.remotePath(repoId), workingCopy),
        ),
      ),
      Effect.zipRight(this.disableSigning(workingCopy)),
      Effect.as(workingCopy),
    );
  }

  /**
   * 공유 원격을 임시 디렉토리에 clone해 작업하고, 성공/실패와 무관하게 삭제한다.
   * 사용자 작업 사본(현재 브랜치·미커밋 변경·충돌 상태)을 건드리지 않고 원격을 갱신할 때 쓴다.
   */
  withScratchClone<A, E>(
    repoId: string,
    use: (git: SimpleGit) => Effect.Effect<A, E>,
  ): Effect.Effect<A, E | GitError | FileError> {
    return Effect.acquireUseRelease(
      Effect.tryPromise({
        try: () => fs.mkdtemp(path.join(os.tmpdir(), "repo-scratch-")),
        catch: (error) =>
          new FileSystemError({
            message: "임시 작업 공간을 만들지 못했습니다",
            originalError: error,
          }),
      }),
      (dir) =>
        tryGit("clone", () =>
          simpleGit().clone(this.remotePath(repoId), dir),
        ).pipe(
          Effect.zipRight(this.disableSigning(dir)),
          Effect.zipRight(Effect.suspend(() => use(simpleGit(dir)))),
        ),
      (dir) =>
        remove(dir, repoId).pipe(
          Effect.catchAll((error) =>
            Effect.sync(() =>
              this.logger.warn(
                `임시 clone 삭제 실패 (${dir}): ${error.message}`,
              ),
            ),
          ),
        ),
    );
  }

  /**
   * 원격과 모든 사용자의 작업 사본을 삭제한다.
   * 공개 레포를 열람만 한 사용자도 작업 사본이 있으므로 사용자 디렉토리를 모두 확인한다.
   */
  removeAll(repoId: string): Effect.Effect<void> {
    const workingCopies = Effect.tryPromise(() =>
      fs.readdir(this.repoBasePath, { withFileTypes: true }),
    ).pipe(
      Effect.map((entries) =>
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => this.workingCopyPath(entry.name, repoId)),
      ),
      Effect.orElseSucceed(() => [] as string[]),
    );

    return workingCopies.pipe(
      Effect.map((paths) => [...paths, this.remotePath(repoId)]),
      Effect.flatMap((paths) =>
        Effect.forEach(
          paths,
          (target) =>
            remove(target, repoId).pipe(
              Effect.catchTag("FileNotFoundError", () => Effect.void),
              Effect.catchAll((error) =>
                Effect.sync(() =>
                  this.logger.warn(
                    `저장소 파일 삭제 실패 (${target}): ${error.message}`,
                  ),
                ),
              ),
            ),
          { concurrency: 4, discard: true },
        ),
      ),
    );
  }

  private disableSigning(workingCopy: string): Effect.Effect<void, GitError> {
    return tryGit("config", () =>
      simpleGit(workingCopy).addConfig("commit.gpgsign", "false"),
    ).pipe(Effect.asVoid);
  }
}
