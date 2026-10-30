import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Effect, Option } from "effect";
import { type FindOptionsWhere, In, Repository } from "typeorm";
import type { DbError } from "@src/common/error";
import {
  type Repo,
  RepoSchema,
  type RepoView,
  RepoViewSchema,
} from "@src/domain/repo/repo";
import { PrReview } from "@src/infrastructure/database/entities/pr-review.entity";
import { PullRequest } from "@src/infrastructure/database/entities/pull-request.entity";
import { RepoCollaborator } from "@src/infrastructure/database/entities/repo-collaborator.entity";
import { Repo as RepoEntity } from "@src/infrastructure/database/entities/repo.entity";
import { BaseRepository } from "./base.repository";

export interface NewRepo {
  readonly ownerId: string;
  readonly name: string;
  readonly description: string | null;
  readonly isPrivate: boolean;
  readonly forkedFrom: string | null;
}

@Injectable()
export class RepoRepository extends BaseRepository {
  constructor(
    @InjectRepository(RepoEntity)
    private readonly repos: Repository<RepoEntity>,
  ) {
    super();
  }

  findById(repoId: string): Effect.Effect<Option.Option<Repo>, DbError> {
    return this.query(
      () => this.repos.findOne({ where: { repoId } }),
      `레포지토리 조회에 실패했습니다 (repoId: ${repoId})`,
    ).pipe(
      Effect.flatMap((entity) =>
        entity === null
          ? Effect.succeed(Option.none())
          : this.toModel(RepoSchema, entity).pipe(Effect.map(Option.some)),
      ),
    );
  }

  findView(repoId: string): Effect.Effect<Option.Option<RepoView>, DbError> {
    return this.query(
      () => this.repos.findOne({ where: { repoId }, relations: ["owner"] }),
      `레포지토리 조회에 실패했습니다 (repoId: ${repoId})`,
    ).pipe(
      Effect.flatMap((entity) =>
        entity === null
          ? Effect.succeed(Option.none())
          : this.toView(entity).pipe(Effect.map(Option.some)),
      ),
    );
  }

  findViews(
    where: FindOptionsWhere<RepoEntity>,
  ): Effect.Effect<readonly RepoView[], DbError> {
    return this.query(
      () =>
        this.repos.find({
          where,
          relations: ["owner"],
          order: { createdAt: "DESC" },
        }),
      "레포지토리 목록 조회에 실패했습니다",
    ).pipe(Effect.flatMap((rows) => Effect.forEach(rows, this.toView)));
  }

  /** 소유하거나 협업자로 참여 중인 레포 (중복 없이 최신순) */
  findAccessibleViews(
    userId: string,
  ): Effect.Effect<readonly RepoView[], DbError> {
    return this.query(
      () =>
        this.repos
          .createQueryBuilder("repo")
          .leftJoinAndSelect("repo.owner", "owner")
          .where("repo.ownerId = :userId", { userId })
          .orWhere((qb) => {
            const sub = qb
              .subQuery()
              .select("c.repoId")
              .from(RepoCollaborator, "c")
              .where("c.userId = :userId")
              .getQuery();
            return `repo.repoId IN ${sub}`;
          })
          .orderBy("repo.createdAt", "DESC")
          .getMany(),
      "레포지토리 목록 조회에 실패했습니다",
    ).pipe(Effect.flatMap((rows) => Effect.forEach(rows, this.toView)));
  }

  create(data: NewRepo): Effect.Effect<Repo, DbError> {
    return this.query(
      () => this.repos.save(this.repos.create(data)),
      "레포지토리 생성에 실패했습니다",
    ).pipe(Effect.flatMap((entity) => this.toModel(RepoSchema, entity)));
  }

  delete(repoId: string): Effect.Effect<void, DbError> {
    return this.query(
      () => this.repos.delete(repoId),
      "레포지토리 삭제에 실패했습니다",
    ).pipe(Effect.asVoid);
  }

  /**
   * 레포와 하위 데이터(PR, 리뷰, 협업자)를 한 트랜잭션으로 삭제한다.
   * FK CASCADE가 운영 DB에 반영되어 있다는 보장이 없어 명시적으로 지운다.
   */
  deleteWithRelations(repoId: string): Effect.Effect<void, DbError> {
    return this.query(
      () =>
        this.repos.manager.transaction(async (manager) => {
          const prs = await manager.find(PullRequest, {
            where: { repoId },
            select: { id: true },
          });
          if (prs.length > 0) {
            await manager.delete(PrReview, {
              pullRequestId: In(prs.map((pr) => pr.id)),
            });
          }
          await manager.delete(PullRequest, { repoId });
          await manager.delete(RepoCollaborator, { repoId });
          await manager.delete(RepoEntity, { repoId });
        }),
      "레포지토리 삭제에 실패했습니다",
    );
  }

  private readonly toView = (
    entity: RepoEntity,
  ): Effect.Effect<RepoView, DbError> =>
    this.toModel(RepoViewSchema, {
      ...entity,
      owner: entity.owner
        ? { id: entity.owner.id, email: entity.owner.email }
        : undefined,
    });
}
