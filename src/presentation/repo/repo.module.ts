import { Module } from "@nestjs/common";
import { CollaboratorService } from "@src/application/repo/collaborator.service";
import { RepoWorkspaceModule } from "@src/application/repo/repo-workspace.module";
import { RepoService } from "@src/application/repo/repo.service";
import { UserModule } from "@src/presentation/user/user.module";
import { CollaboratorController } from "./collaborator.controller";
import { RepoController } from "./repo.controller";

@Module({
  imports: [RepoWorkspaceModule, UserModule],
  controllers: [RepoController, CollaboratorController],
  providers: [RepoService, CollaboratorService],
})
export class RepoModule {}
