import { Module } from "@nestjs/common";
import { GitController } from "@src/repos/controllers/git.controller";
import { BranchController } from "@src/repos/controllers/branch.controller";
import { PullRequestController } from "@src/repos/controllers/pull-request.controller";
import { ConflictController } from "@src/repos/controllers/conflict.controller";
import { DiffController } from "@src/repos/controllers/diff.controller";
import { AIAssistantController } from "@src/repos/controllers/ai-assistant.controller";
import { GitRemoteService } from "@src/repos/services/git-remote/git-remote.service";
import { GitOperationService } from "@src/repos/services/git-operation.service";
import { BranchService } from "@src/repos/services/branch/branch.service";
import { PullRequestService } from "@src/repos/services/pull-request.service";
import { FileModule } from "@src/presentation/file/file.module";
import { GitConflictService } from "@src/repos/services/git-conflict.service";
import { AIConflictResolverService } from "@src/repos/services/ai-conflict-resolver.service";
import { AIAssistantService } from "@src/repos/services/ai-assistant.service";
import { GitDiffService } from "@src/repos/services/git-diff.service";
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
  controllers: [
    GitController,
    BranchController,
    PullRequestController,
    ConflictController,
    DiffController,
    AIAssistantController,
  ],
  providers: [
    GitRemoteService,
    GitOperationService,
    BranchService,
    PullRequestService,
    GitConflictService,
    AIConflictResolverService,
    AIAssistantService,
    GitDiffService,
  ],
})
export class ReposModule {}
