import { Injectable } from "@nestjs/common";
import { Effect, Option } from "effect";
import { getOrFail } from "@src/common/effect";
import {
  CollaboratorConflictError,
  CollaboratorNotFoundError,
  type DbError,
  type RepoError,
  UserNotFoundError,
} from "@src/common/error";
import type {
  AddCollaboratorBody,
  Collaborator,
  CollaboratorWithUser,
} from "@src/domain/repo/collaborator";
import type { CollaboratorRole } from "@src/domain/repo/collaborator-role";
import { CollaboratorRepository } from "@src/infrastructure/repositories/collaborator.repository";
import { UserRepository } from "@src/infrastructure/repositories/user.repository";
import { RepoWorkspaceService } from "./repo-workspace.service";

const notFound = () =>
  new CollaboratorNotFoundError({ message: "Collaborator not found" });

@Injectable()
export class CollaboratorService {
  constructor(
    private readonly workspaces: RepoWorkspaceService,
    private readonly collaboratorRepository: CollaboratorRepository,
    private readonly userRepository: UserRepository,
  ) {}

  add(
    repoId: string,
    actorId: string,
    body: AddCollaboratorBody,
  ): Effect.Effect<
    Collaborator,
    RepoError | DbError | CollaboratorConflictError | UserNotFoundError
  > {
    return Effect.gen(this, function* () {
      const repo = yield* this.workspaces.authorize(repoId, actorId, "admin");
      if (repo.ownerId === body.userId) {
        return yield* new CollaboratorConflictError({
          message: "Cannot add owner as collaborator",
        });
      }
      // 존재하지 않는 사용자를 넣으면 FK 오류(500)가 나므로 먼저 확인
      yield* this.userRepository
        .findById(body.userId)
        .pipe(
          getOrFail(
            () =>
              new UserNotFoundError({ message: "사용자를 찾을 수 없습니다." }),
          ),
        );
      const existing = yield* this.collaboratorRepository.find(
        repoId,
        body.userId,
      );
      if (Option.isSome(existing)) {
        return yield* new CollaboratorConflictError({
          message: "User is already a collaborator",
        });
      }
      return yield* this.collaboratorRepository.create(
        repoId,
        body.userId,
        body.role,
      );
    });
  }

  list(
    repoId: string,
    actorId: string,
  ): Effect.Effect<readonly CollaboratorWithUser[], RepoError | DbError> {
    return this.workspaces
      .authorize(repoId, actorId, "read")
      .pipe(Effect.zipRight(this.collaboratorRepository.listWithUsers(repoId)));
  }

  updateRole(
    repoId: string,
    actorId: string,
    targetUserId: string,
    role: CollaboratorRole,
  ): Effect.Effect<
    Collaborator,
    RepoError | DbError | CollaboratorNotFoundError
  > {
    return this.workspaces.authorize(repoId, actorId, "admin").pipe(
      Effect.zipRight(this.collaboratorRepository.find(repoId, targetUserId)),
      getOrFail(notFound),
      Effect.flatMap((collaborator) =>
        this.collaboratorRepository.updateRole(collaborator, role),
      ),
    );
  }

  remove(
    repoId: string,
    actorId: string,
    targetUserId: string,
  ): Effect.Effect<
    { success: true; message: string },
    RepoError | DbError | CollaboratorNotFoundError
  > {
    return this.workspaces.authorize(repoId, actorId, "admin").pipe(
      Effect.zipRight(this.collaboratorRepository.find(repoId, targetUserId)),
      getOrFail(notFound),
      Effect.flatMap((collaborator) =>
        this.collaboratorRepository.delete(collaborator.id),
      ),
      Effect.as({
        success: true as const,
        message: "Collaborator removed successfully",
      }),
    );
  }
}
