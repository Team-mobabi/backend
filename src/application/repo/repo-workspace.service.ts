import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Effect, Option } from "effect";
import simpleGit, { type SimpleGit } from "simple-git";
import {
  type DbError,
  type FileError,
  type GitError,
  RepoAccessDeniedError,
  type RepoError,
  RepoNotFoundError,
} from "@src/common/error";
import type { CollaboratorRole } from "@src/domain/repo/collaborator-role";
import { roleSatisfies } from "@src/domain/repo/collaborator-role";
import type { Repo } from "@src/domain/repo/repo";
import { ensureDir, statOption } from "@src/infrastructure/file/file-system";
import { tryGit } from "@src/infrastructure/git/git";
import { CollaboratorRepository } from "@src/infrastructure/repositories/collaborator.repository";
import { RepoRepository } from "@src/infrastructure/repositories/repo.repository";

export interface RepoWorkspace {
  readonly repo: Repo;
  /** 사용자별 작업 사본의 절대 경로 */
  readonly root: string;
  readonly git: SimpleGit;
}

export type WorkspaceError = RepoError | DbError | GitError | FileError;

@Injectable()
export class RepoWorkspaceService {
  private readonly repoBasePath: string;
  private readonly remoteBasePath: string;

  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly collaboratorRepository: CollaboratorRepository,
    configService: ConfigService,
  ) {
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

  /**
   * 권한을 확인하고 사용자별 작업 사본을 반환한다.
   * 작업 사본이 없으면 원격(bare) 저장소에서 clone한다.
   */
  open(
    repoId: string,
    userId: string,
    requiredRole: CollaboratorRole = "read",
  ): Effect.Effect<RepoWorkspace, WorkspaceError> {
    return this.authorize(repoId, userId, requiredRole).pipe(
      Effect.flatMap((repo) =>
        this.ensureWorkingCopy(repoId, userId).pipe(
          Effect.map((root) => ({ repo, root, git: simpleGit(root) })),
        ),
      ),
    );
  }

  private authorize(
    repoId: string,
    userId: string,
    requiredRole: CollaboratorRole,
  ): Effect.Effect<Repo, RepoError | DbError> {
    const denied = new RepoAccessDeniedError({
      message: `레포지토리 '${repoId}'에 접근 권한이 없습니다`,
      repoId,
    });

    return this.repoRepository.findById(repoId).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new RepoNotFoundError({
                message: `레포지토리 '${repoId}'을(를) 찾을 수 없습니다`,
                repoId,
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
      Effect.tap((repo) => {
        if (repo.ownerId === userId) return Effect.void;
        // 공개 레포는 누구나 읽기 가능
        if (!repo.isPrivate && requiredRole === "read") return Effect.void;
        return this.collaboratorRepository
          .findRole(repoId, userId)
          .pipe(
            Effect.flatMap((role) =>
              Option.exists(role, (r) => roleSatisfies(r, requiredRole))
                ? Effect.void
                : Effect.fail(denied),
            ),
          );
      }),
    );
  }

  private ensureWorkingCopy(
    repoId: string,
    userId: string,
  ): Effect.Effect<string, GitError | FileError> {
    const root = path.join(this.repoBasePath, userId, repoId);
    const remote = path.join(this.remoteBasePath, `${repoId}.git`);

    return statOption(root, repoId).pipe(
      Effect.flatMap(
        Option.match({
          onSome: () => Effect.succeed(root),
          onNone: () =>
            ensureDir(path.dirname(root), repoId).pipe(
              Effect.zipRight(
                tryGit("clone", () => simpleGit().clone(remote, root)),
              ),
              Effect.zipRight(
                tryGit("config", () =>
                  simpleGit(root).addConfig("commit.gpgsign", "false"),
                ),
              ),
              Effect.as(root),
            ),
        }),
      ),
    );
  }
}
