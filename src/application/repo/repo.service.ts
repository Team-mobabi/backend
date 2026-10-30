import { Injectable } from "@nestjs/common";
import { Effect } from "effect";
import { getOrFail } from "@src/common/effect";
import {
  type DbError,
  type FileError,
  type GitError,
  RepoAccessDeniedError,
  type RepoError,
  RepoNotFoundError,
} from "@src/common/error";
import type {
  CreateRepoBody,
  ForkRepoBody,
  Repo,
  RepoView,
} from "@src/domain/repo/repo";
import { RepoStorageService } from "@src/infrastructure/git/repo-storage.service";
import { RepoRepository } from "@src/infrastructure/repositories/repo.repository";

type CreateError = DbError | GitError | FileError | RepoError;

const notFound = (repoId: string, message: string) => () =>
  new RepoNotFoundError({ message, repoId });

@Injectable()
export class RepoService {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly storage: RepoStorageService,
  ) {}

  create(
    body: CreateRepoBody,
    ownerId: string,
  ): Effect.Effect<RepoView, CreateError> {
    return this.repoRepository
      .create({
        ownerId,
        name: body.name,
        description: body.description ?? null,
        isPrivate: body.isPrivate,
        forkedFrom: null,
      })
      .pipe(
        Effect.tap((repo) =>
          this.withRollback(
            repo,
            this.storage.initialize(repo.repoId, ownerId),
          ),
        ),
        Effect.flatMap((repo) => this.view(repo.repoId)),
      );
  }

  fork(
    body: ForkRepoBody,
    userId: string,
  ): Effect.Effect<RepoView, CreateError> {
    return this.repoRepository.findById(body.sourceRepoId).pipe(
      getOrFail(
        notFound(body.sourceRepoId, "원본 레포지토리를 찾을 수 없습니다."),
      ),
      Effect.filterOrFail(
        (source) => !source.isPrivate || source.ownerId === userId,
        (source) =>
          new RepoAccessDeniedError({
            message: "비공개 레포지토리는 Fork할 수 없습니다.",
            repoId: source.repoId,
          }),
      ),
      Effect.flatMap((source) =>
        this.repoRepository.create({
          ownerId: userId,
          name: body.name || source.name,
          description: source.description,
          isPrivate: body.isPrivate,
          forkedFrom: source.repoId,
        }),
      ),
      Effect.tap((repo) =>
        this.withRollback(
          repo,
          this.storage.fork(body.sourceRepoId, repo.repoId, userId),
        ),
      ),
      Effect.flatMap((repo) => this.view(repo.repoId)),
    );
  }

  listAccessible(userId: string): Effect.Effect<readonly RepoView[], DbError> {
    return this.repoRepository.findAccessibleViews(userId);
  }

  listPublic(ownerId?: string): Effect.Effect<readonly RepoView[], DbError> {
    return this.repoRepository.findViews(
      ownerId === undefined
        ? { isPrivate: false }
        : { isPrivate: false, ownerId },
    );
  }

  /** DB 삭제가 성공한 뒤 디스크를 정리한다. 파일 정리 실패는 경고만 남긴다 */
  delete(
    repoId: string,
    userId: string,
  ): Effect.Effect<void, DbError | RepoError> {
    return this.repoRepository.findById(repoId).pipe(
      getOrFail(notFound(repoId, "레포지토리를 찾을 수 없습니다.")),
      Effect.filterOrFail(
        (repo) => repo.ownerId === userId,
        () =>
          new RepoAccessDeniedError({
            message: "레포지토리를 삭제할 권한이 없습니다.",
            repoId,
          }),
      ),
      Effect.zipRight(this.repoRepository.deleteWithRelations(repoId)),
      Effect.zipRight(this.storage.removeAll(repoId)),
    );
  }

  private view(repoId: string): Effect.Effect<RepoView, DbError | RepoError> {
    return this.repoRepository
      .findView(repoId)
      .pipe(
        getOrFail(notFound(repoId, "생성된 레포지토리를 찾을 수 없습니다.")),
      );
  }

  /** 디스크 작업이 실패하면 방금 만든 DB 행과 파일을 되돌린다 */
  private withRollback<E>(
    repo: Repo,
    effect: Effect.Effect<void, E>,
  ): Effect.Effect<void, E> {
    return effect.pipe(
      Effect.onError(() =>
        this.repoRepository
          .delete(repo.repoId)
          .pipe(
            Effect.ignore,
            Effect.zipRight(this.storage.removeAll(repo.repoId)),
          ),
      ),
    );
  }
}
