import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Effect, Option } from "effect";
import { Repository } from "typeorm";
import type { DbError } from "@src/common/error";
import {
  type Collaborator,
  CollaboratorSchema,
  type CollaboratorWithUser,
  CollaboratorWithUserSchema,
} from "@src/domain/repo/collaborator";
import type { CollaboratorRole } from "@src/domain/repo/collaborator-role";
import {
  CollaboratorRole as EntityRole,
  RepoCollaborator,
} from "@src/infrastructure/database/entities/repo-collaborator.entity";
import { BaseRepository } from "./base.repository";

const ENTITY_ROLE: Record<CollaboratorRole, EntityRole> = {
  read: EntityRole.READ,
  write: EntityRole.WRITE,
  admin: EntityRole.ADMIN,
};

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
    return this.find(repoId, userId).pipe(
      Effect.map(Option.map((collaborator) => collaborator.role)),
    );
  }

  find(
    repoId: string,
    userId: string,
  ): Effect.Effect<Option.Option<Collaborator>, DbError> {
    return this.query(
      () => this.collaborators.findOne({ where: { repoId, userId } }),
      `협업자 조회에 실패했습니다 (repoId: ${repoId})`,
    ).pipe(
      Effect.flatMap((row) =>
        row === null
          ? Effect.succeed(Option.none())
          : this.toModel(CollaboratorSchema, row).pipe(Effect.map(Option.some)),
      ),
    );
  }

  listWithUsers(
    repoId: string,
  ): Effect.Effect<readonly CollaboratorWithUser[], DbError> {
    return this.query(
      () =>
        this.collaborators
          .createQueryBuilder("collaborator")
          .leftJoinAndSelect("collaborator.user", "user")
          .where("collaborator.repoId = :repoId", { repoId })
          .orderBy("collaborator.addedAt", "DESC")
          .getMany(),
      "협업자 목록 조회에 실패했습니다",
    ).pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) =>
          this.toModel(CollaboratorWithUserSchema, {
            ...row,
            user: row.user ? { id: row.user.id, email: row.user.email } : null,
          }),
        ),
      ),
    );
  }

  create(
    repoId: string,
    userId: string,
    role: CollaboratorRole,
  ): Effect.Effect<Collaborator, DbError> {
    return this.query(
      () =>
        this.collaborators.save(
          this.collaborators.create({
            repoId,
            userId,
            role: ENTITY_ROLE[role],
          }),
        ),
      "협업자 추가에 실패했습니다",
    ).pipe(Effect.flatMap((row) => this.toModel(CollaboratorSchema, row)));
  }

  updateRole(
    collaborator: Collaborator,
    role: CollaboratorRole,
  ): Effect.Effect<Collaborator, DbError> {
    return this.query(
      () =>
        this.collaborators.update(collaborator.id, {
          role: ENTITY_ROLE[role],
        }),
      "협업자 권한 수정에 실패했습니다",
    ).pipe(Effect.as({ ...collaborator, role }));
  }

  delete(id: string): Effect.Effect<void, DbError> {
    return this.query(
      () => this.collaborators.delete(id),
      "협업자 제거에 실패했습니다",
    ).pipe(Effect.asVoid);
  }
}
