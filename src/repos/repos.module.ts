import { Module } from "@nestjs/common";
import { ConflictController } from "@src/repos/controllers/conflict.controller";
import { AIAssistantController } from "@src/repos/controllers/ai-assistant.controller";
import { FileModule } from "@src/presentation/file/file.module";
import { GitConflictService } from "@src/repos/services/git-conflict.service";
import { AIConflictResolverService } from "@src/repos/services/ai-conflict-resolver.service";
import { AIAssistantService } from "@src/repos/services/ai-assistant.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Repo } from "@src/infrastructure/database/entities/repo.entity";
import { PullRequest } from "@src/infrastructure/database/entities/pull-request.entity";
import { PrReview } from "@src/infrastructure/database/entities/pr-review.entity";
import { RepoCollaborator } from "@src/infrastructure/database/entities/repo-collaborator.entity";

@Module({
  imports: [
    FileModule,
    TypeOrmModule.forFeature([Repo, PullRequest, PrReview, RepoCollaborator]),
  ],
  controllers: [ConflictController, AIAssistantController],
  providers: [
    GitConflictService,
    AIConflictResolverService,
    AIAssistantService,
  ],
})
export class ReposModule {}
