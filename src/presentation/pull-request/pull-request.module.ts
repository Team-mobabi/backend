import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PullRequestService } from "@src/application/pull-request/pull-request.service";
import { RepoWorkspaceModule } from "@src/application/repo/repo-workspace.module";
import { PrReview } from "@src/infrastructure/database/entities/pr-review.entity";
import { PullRequest } from "@src/infrastructure/database/entities/pull-request.entity";
import { PullRequestRepository } from "@src/infrastructure/repositories/pull-request.repository";
import { GitModule } from "@src/presentation/git/git.module";
import { PullRequestController } from "./pull-request.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([PullRequest, PrReview]),
    RepoWorkspaceModule,
    GitModule,
  ],
  controllers: [PullRequestController],
  providers: [PullRequestRepository, PullRequestService],
})
export class PullRequestModule {}
