import { Module } from "@nestjs/common";
import { BranchService } from "@src/application/git/branch.service";
import { GitDiffService } from "@src/application/git/git-diff.service";
import { GitOperationService } from "@src/application/git/git-operation.service";
import { GitRemoteService } from "@src/application/git/git-remote.service";
import { RepoWorkspaceModule } from "@src/application/repo/repo-workspace.module";
import { BranchController } from "./branch.controller";
import { DiffController } from "./diff.controller";
import { GitController } from "./git.controller";

@Module({
  imports: [RepoWorkspaceModule],
  controllers: [GitController, BranchController, DiffController],
  providers: [
    GitOperationService,
    GitRemoteService,
    BranchService,
    GitDiffService,
  ],
  exports: [GitDiffService, BranchService],
})
export class GitModule {}
