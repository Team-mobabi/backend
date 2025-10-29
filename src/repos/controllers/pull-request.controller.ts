import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@src/auth/guards/jwt-auth.guard";
import { PullRequestService } from "@src/repos/services/pull-request.service";
import { GitDiffService } from "@src/repos/services/git-diff.service";
import { CreatePullRequestDto } from "@src/repos/dto/create-pull-request.dto";
import { MergePullRequestDto } from "@src/repos/dto/merge-pull-request.dto";
import { CreateReviewDto } from "@src/repos/dto/create-review.dto";
import { PullRequestStatus, PullRequest } from "@src/repos/entities/pull-request.entity";
import { PrReview } from "@src/repos/entities/pr-review.entity";
import { User } from "@src/users/entities/user.entity";
import { AuthUser } from "@src/repos/auth-user.decorator";

@ApiTags("Pull Requests")
@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class PullRequestController {
  constructor(
    private readonly pullRequestService: PullRequestService,
    private readonly gitDiffService: GitDiffService,
  ) {}

  @ApiOperation({ summary: "Pull Request 생성" })
  @ApiResponse({
    status: 201,
    description: "Pull Request가 성공적으로 생성됨",
    type: PullRequest,
  })
  @Post(":repoId/pull-requests")
  @HttpCode(HttpStatus.CREATED)
  async createPullRequest(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() createPullRequestDto: CreatePullRequestDto,
  ) {
    return this.pullRequestService.createPullRequest(
      repoId,
      user.id,
      createPullRequestDto,
    );
  }

  @ApiOperation({ summary: "Pull Request 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "Pull Request 목록 반환",
    type: [PullRequest],
  })
  @Get(":repoId/pull-requests")
  @HttpCode(HttpStatus.OK)
  async getPullRequests(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("status") status?: PullRequestStatus,
  ) {
    return this.pullRequestService.getPullRequests(repoId, user.id, status);
  }

  @ApiOperation({ summary: "Pull Request 상세 조회" })
  @ApiResponse({
    status: 200,
    description: "Pull Request 상세 정보 반환",
    type: PullRequest,
  })
  @Get(":repoId/pull-requests/:prId")
  @HttpCode(HttpStatus.OK)
  async getPullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.pullRequestService.getPullRequest(repoId, user.id, prId);
  }

  @ApiOperation({ summary: "Pull Request 병합" })
  @ApiResponse({
    status: 200,
    description: "Pull Request가 성공적으로 병합됨",
    type: PullRequest,
  })
  @Post(":repoId/pull-requests/:prId/merge")
  @HttpCode(HttpStatus.OK)
  async mergePullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Body() mergePullRequestDto?: MergePullRequestDto,
  ) {
    return this.pullRequestService.mergePullRequest(
      repoId,
      user.id,
      prId,
      mergePullRequestDto?.fastForwardOnly || false,
    );
  }

  @ApiOperation({ summary: "Pull Request 닫기" })
  @ApiResponse({
    status: 200,
    description: "Pull Request가 성공적으로 닫힘",
    type: PullRequest,
  })
  @Post(":repoId/pull-requests/:prId/close")
  @HttpCode(HttpStatus.OK)
  async closePullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.pullRequestService.closePullRequest(repoId, user.id, prId);
  }

  @ApiOperation({ summary: "Pull Request 리뷰 작성" })
  @ApiResponse({
    status: 201,
    description: "리뷰가 성공적으로 작성됨",
    type: PrReview,
  })
  @Post(":repoId/pull-requests/:prId/reviews")
  @HttpCode(HttpStatus.CREATED)
  async createReview(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Body() createReviewDto: CreateReviewDto,
  ) {
    return this.pullRequestService.createReview(
      repoId,
      user.id,
      prId,
      createReviewDto,
    );
  }

  @ApiOperation({ summary: "Pull Request 리뷰 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "리뷰 목록 반환",
    type: [PrReview],
  })
  @Get(":repoId/pull-requests/:prId/reviews")
  @HttpCode(HttpStatus.OK)
  async getReviews(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.pullRequestService.getReviews(repoId, user.id, prId);
  }

  @ApiOperation({
    summary: "Pull Request의 변경사항 diff",
    description: "PR의 source와 target 브랜치 간 diff를 조회합니다"
  })
  @ApiResponse({
    status: 200,
    description: "PR diff 정보"
  })
  @Get(":repoId/pull-requests/:prId/diff")
  @HttpCode(HttpStatus.OK)
  async getPullRequestDiff(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Query("path") filePath?: string,
  ) {
    // PR 정보 조회
    const pr = await this.pullRequestService.getPullRequest(repoId, user.id, prId);

    // source와 target 브랜치 간 diff
    return this.gitDiffService.getBranchDiff(
      repoId,
      user.id,
      pr.sourceBranch,
      pr.targetBranch,
      filePath
    );
  }
}