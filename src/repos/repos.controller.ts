import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ReposService } from "@src/repos/repos.service";
import { Repo } from "@src/repos/entities/repo.entity";
import { CreateRepoDto } from "@src/repos/dto/create-repo.dto";
import { AddRemoteDto } from "./dto/add-remote.dto";
import { PushDto } from "./dto/push.dto";
import { CreateLocalRemoteDto } from "./dto/create-local-remote.dto";
import { AddDto } from "@src/repos/dto/add.dto";
import { CommitDto } from "@src/repos/dto/commit.dto";
import { CreatePullRequestDto } from "./dto/create-pull-request.dto";
import { MergePullRequestDto } from "./dto/merge-pull-request.dto";
import { CreateReviewDto } from "./dto/create-review.dto";
import { PullRequestStatus } from "./entities/pull-request.entity";
import { AuthGuard } from "@nestjs/passport";
import { User } from "@src/users/entities/user.entity";
import { AuthUser } from "@src/repos/auth-user.decorator";

@Controller("repos")
@UseGuards(AuthGuard("jwt"))
export class ReposController {
  constructor(private readonly reposService: ReposService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRepo(
    @Body() createRepoDto: CreateRepoDto,
    @AuthUser() user: User,
  ): Promise<Repo> {
    return this.reposService.createRepo(createRepoDto, user.id);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getMyRepos(@AuthUser() user: User): Promise<Repo[]> {
    return this.reposService.findReposByOwner(user.id);
  }

  @Post(":repoId/add")
  @HttpCode(HttpStatus.OK)
  async addFiles(
    @Param("repoId") repoId: string,
    @Body() addDto: AddDto,
    @AuthUser() user: User,
  ) {
    return this.reposService.addFilesToRepo(repoId, user.id, addDto.files);
  }

  @Post(":repoId/commit")
  @HttpCode(HttpStatus.OK)
  async commit(
    @Param("repoId") repoId: string,
    @Body() commitDto: CommitDto,
    @AuthUser() user: User,
  ) {
    return this.reposService.commitToRepo(repoId, user.id, commitDto.message, commitDto.branch);
  }

  @Post(":repoId/remote")
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerRemote(
    @Param("repoId") repoId: string,
    @Body() addRemoteDto: AddRemoteDto,
    @AuthUser() user: User,
  ) {
    await this.reposService.addRemote(
      repoId,
      user.id,
      addRemoteDto.url,
      addRemoteDto.name,
    );
  }

  @Post(":repoId/pull")
  @HttpCode(HttpStatus.OK)
  pull(@Param("repoId") repoId: string, @AuthUser() user: User) {
    return this.reposService.pullRepo(repoId, user.id);
  }

  @Get(":repoId/status")
  async getStatus(@Param("repoId") repoId: string, @AuthUser() user: User) {
    const files = await this.reposService.status(repoId, user.id);
    return { files };
  }

  @Post(":repoId/push")
  @HttpCode(HttpStatus.OK)
  async push(
    @Param("repoId") repoId: string,
    @Body() pushDto: PushDto,
    @AuthUser() user: User,
  ) {
    return this.reposService.pushRepo(
      repoId,
      user.id,
      pushDto.remote,
      pushDto.branch,
    );
  }

  @Get(":repoId/branches")
  @HttpCode(HttpStatus.OK)
  async listBranches(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("limit") limit?: string,
  ) {
    const commitLimit = limit ? Number(limit) : 20;
    return this.reposService.getBranches(repoId, user.id, commitLimit);
  }

  @Get(":repoId/graph")
  @HttpCode(HttpStatus.OK)
  async graph(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("since") since?: string,
    @Query("max") max?: string,
  ) {
    return this.reposService.getGraph(
      repoId,
      user.id,
      since,
      Number(max) || 200,
    );
  }

  @Post(":repoId/remote-local")
  @HttpCode(HttpStatus.CREATED)
  async createLocalRemote(
    @Param("repoId") repoId: string,
    @Body() createLocalRemoteDto: CreateLocalRemoteDto,
    @AuthUser() user: User,
  ) {
    const remoteInfo = await this.reposService.createLocalRemote(
      repoId,
      user.id,
      createLocalRemoteDto.name,
    );
    return {
      success: true,
      remotePath: remoteInfo.path,
      remoteName: remoteInfo.name,
    };
  }

  @Post(":repoId/branches")
  @HttpCode(HttpStatus.CREATED)
  async createBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body("name") newBranchName: string,
    @Body("from") baseBranchName?: string,
  ) {
    return this.reposService.createBranch(
      repoId,
      user.id,
      newBranchName,
      baseBranchName,
    );
  }

  @Post(":repoId/branches/switch")
  @HttpCode(HttpStatus.OK)
  async switchBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body("name") branchName: string,
  ) {
    return this.reposService.switchBranch(repoId, user.id, branchName);
  }

  @Delete(":repoId/branches/:branchName")
  @HttpCode(HttpStatus.OK)
  async deleteBranch(
    @Param("repoId") repoId: string,
    @Param("branchName") branchName: string,
    @AuthUser() user: User,
  ) {
    return this.reposService.deleteBranch(repoId, user.id, branchName);
  }

  @Post(":repoId/merge")
  @HttpCode(HttpStatus.OK)
  async mergeBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body("sourceBranch") sourceBranch: string,
    @Body("targetBranch") targetBranch?: string,
    @Body("fastForwardOnly") fastForwardOnly?: boolean,
  ) {
    return this.reposService.mergeBranch(
      repoId,
      user.id,
      sourceBranch,
      targetBranch,
      fastForwardOnly || false,
    );
  }

  @Post(":repoId/pull-requests")
  @HttpCode(HttpStatus.CREATED)
  async createPullRequest(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() createPullRequestDto: CreatePullRequestDto,
  ) {
    return this.reposService.createPullRequest(repoId, user.id, createPullRequestDto);
  }

  @Get(":repoId/pull-requests")
  @HttpCode(HttpStatus.OK)
  async getPullRequests(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("status") status?: PullRequestStatus,
  ) {
    return this.reposService.getPullRequests(repoId, user.id, status);
  }

  @Get(":repoId/pull-requests/:prId")
  @HttpCode(HttpStatus.OK)
  async getPullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.reposService.getPullRequest(repoId, user.id, prId);
  }

  @Post(":repoId/pull-requests/:prId/merge")
  @HttpCode(HttpStatus.OK)
  async mergePullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.reposService.mergePullRequest(repoId, user.id, prId, false);
  }

  @Post(":repoId/pull-requests/:prId/close")
  @HttpCode(HttpStatus.OK)
  async closePullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.reposService.closePullRequest(repoId, user.id, prId);
  }

  @Post(":repoId/pull-requests/:prId/reviews")
  @HttpCode(HttpStatus.CREATED)
  async createReview(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Body() createReviewDto: CreateReviewDto,
  ) {
    return this.reposService.createReview(repoId, user.id, prId, createReviewDto);
  }

  @Get(":repoId/pull-requests/:prId/reviews")
  @HttpCode(HttpStatus.OK)
  async getReviews(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.reposService.getReviews(repoId, user.id, prId);
  }
}
