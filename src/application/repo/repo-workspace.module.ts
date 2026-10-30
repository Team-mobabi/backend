import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RepoWorkspaceService } from "@src/application/repo/repo-workspace.service";
import { CollaboratorRepository } from "@src/infrastructure/repositories/collaborator.repository";
import { RepoRepository } from "@src/infrastructure/repositories/repo.repository";
import { RepoCollaborator } from "@src/infrastructure/database/entities/repo-collaborator.entity";
import { Repo } from "@src/infrastructure/database/entities/repo.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Repo, RepoCollaborator])],
  providers: [RepoWorkspaceService, RepoRepository, CollaboratorRepository],
  exports: [RepoWorkspaceService],
})
export class RepoWorkspaceModule {}
