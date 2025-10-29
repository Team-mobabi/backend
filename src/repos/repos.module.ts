import { Module } from "@nestjs/common";
import { ReposService } from "@src/repos/repos.service";
import { ReposController } from "@src/repos/controllers/repos.controller";
import { GitController } from "@src/repos/controllers/git.controller";
import { BranchController } from "@src/repos/controllers/branch.controller";
import { PullRequestController } from "@src/repos/controllers/pull-request.controller";
import { FileController } from "@src/repos/controllers/file.controller";
import { ConflictController } from "@src/repos/controllers/conflict.controller";
import { DiffController } from "@src/repos/controllers/diff.controller";
import { GitRemoteService } from "@src/repos/services/git-remote.service";
import { GitOperationService } from "@src/repos/services/git-operation.service";
import { BranchService } from "@src/repos/services/branch.service";
import { PullRequestService } from "@src/repos/services/pull-request.service";
import { FileService } from "@src/repos/services/file.service";
import { GitConflictService } from "@src/repos/services/git-conflict.service";
import { AIConflictResolverService } from "@src/repos/services/ai-conflict-resolver.service";
import { GitDiffService } from "@src/repos/services/git-diff.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Repo } from "@src/repos/entities/repo.entity";
import { PullRequest } from "@src/repos/entities/pull-request.entity";
import { PrReview } from "@src/repos/entities/pr-review.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Repo, PullRequest, PrReview])],
  controllers: [
    ReposController,
    GitController,
    BranchController,
    PullRequestController,
    FileController,
    ConflictController,
    DiffController,
  ],
  providers: [
    ReposService,
    GitRemoteService,
    GitOperationService,
    BranchService,
    PullRequestService,
    FileService,
    GitConflictService,
    AIConflictResolverService,
    GitDiffService,
  ],
  exports: [ReposService],
})
export class ReposModule {}
