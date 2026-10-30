import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Effect, Option } from "effect";
import { Repository } from "typeorm";
import type { DbError } from "@src/common/error";
import { type Repo, RepoSchema } from "@src/domain/repo/repo";
import { Repo as RepoEntity } from "@src/infrastructure/database/entities/repo.entity";
import { BaseRepository } from "./base.repository";

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
}
