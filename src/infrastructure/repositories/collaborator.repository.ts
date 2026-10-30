import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Effect, Option } from "effect";
import { Repository } from "typeorm";
import type { DbError } from "@src/common/error";
import {
  type CollaboratorRole,
  CollaboratorRoleSchema,
} from "@src/domain/repo/collaborator-role";
import { RepoCollaborator } from "@src/infrastructure/database/entities/repo-collaborator.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class CollaboratorRepository extends BaseRepository {
  constructor(
    @InjectRepository(RepoCollaborator)
    private readonly collaborators: Repository<RepoCollaborator>,
  ) {
    super();
  }

  findRole(
    repoId: string,
    userId: string,
  ): Effect.Effect<Option.Option<CollaboratorRole>, DbError> {
    return this.query(
      () =>
        this.collaborators.findOne({
          where: { repoId, userId },
          select: { role: true },
        }),
      `협업자 권한 조회에 실패했습니다 (repoId: ${repoId})`,
    ).pipe(
      Effect.flatMap((row) =>
        row === null
          ? Effect.succeed(Option.none())
          : this.toModel(CollaboratorRoleSchema, row.role).pipe(
              Effect.map(Option.some),
            ),
      ),
    );
  }
}
