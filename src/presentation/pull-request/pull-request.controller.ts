import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { PullRequestService } from "@src/application/pull-request/pull-request.service";
import { FileDiffListSchema } from "@src/domain/git/diff";
import {
  CreatePullRequestBodySchema,
  CreateReviewBodySchema,
  MergePullRequestBodySchema,
  MergePullRequestResultSchema,
  PullRequestDiffQuerySchema,
  PullRequestIdSchema,
  PullRequestListQuerySchema,
  PullRequestListSchema,
  PullRequestSchema,
  ReviewListSchema,
  ReviewSchema,
} from "@src/domain/pull-request/pull-request";
import { RepoIdSchema } from "@src/domain/repo/repo";
import type { User } from "@src/domain/user/user";
import { JwtAuthGuard } from "@src/infrastructure/auth/jwt-auth.guard";
import { AuthUser } from "@src/presentation/auth/auth-user.decorator";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";

@ApiTags("Pull Requests")
@ApiBearerAuth("JWT-auth")
@ApiParam({ name: "repoId", format: "uuid" })
@ApiResponse({ status: 403, description: "레포지토리 권한 없음" })
@ApiResponse({ status: 404, description: "레포지토리 또는 Pull Request 없음" })
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class PullRequestController extends BaseController {
  protected readonly logger = new Logger(PullRequestController.name);

  constructor(private readonly pullRequestService: PullRequestService) {
    super();
  }

  @ApiOperation({ summary: "Pull Request 생성" })
  @ApiBody({ schema: apiSchema(CreatePullRequestBodySchema) })
  @ApiResponse({ status: 201, schema: apiSchema(PullRequestSchema) })
  @ApiResponse({
    status: 409,
    description: "같은 브랜치이거나 이미 열린 PR 존재",
  })
  @Post(":repoId/pull-requests")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const data = this.decode(CreatePullRequestBodySchema, body);
    return this.runEffect(
      this.pullRequestService.create(this.repoId(repoId), user.id, data),
    );
  }

  @ApiOperation({
    summary: "Pull Request 목록 조회",
    description: "레포지토리의 Pull Request 목록을 조회합니다.",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["open", "merged", "closed"],
  })
  @ApiResponse({ status: 200, schema: apiSchema(PullRequestListSchema) })
  @Get(":repoId/pull-requests")
  list(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { status } = this.decode(PullRequestListQuerySchema, query);
    return this.runEffect(
      this.pullRequestService.list(this.repoId(repoId), user.id, status),
    );
  }

  @ApiOperation({ summary: "Pull Request 상세 조회" })
  @ApiResponse({ status: 200, schema: apiSchema(PullRequestSchema) })
  @Get(":repoId/pull-requests/:prId")
  get(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.runEffect(
      this.pullRequestService.get(
        this.repoId(repoId),
        user.id,
        this.prId(prId),
      ),
    );
  }

  @ApiOperation({
    summary: "Pull Request 병합",
    description: "write 이상의 권한이 필요합니다.",
  })
  @ApiBody({ schema: apiSchema(MergePullRequestBodySchema), required: false })
  @ApiResponse({ status: 200, schema: apiSchema(MergePullRequestResultSchema) })
  @ApiResponse({
    status: 409,
    description: "열린 PR이 아니거나 승인 필요/충돌",
  })
  @Post(":repoId/pull-requests/:prId/merge")
  @HttpCode(HttpStatus.OK)
  merge(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const { fastForwardOnly } = this.decode(
      MergePullRequestBodySchema,
      body ?? {},
    );
    return this.runEffect(
      this.pullRequestService.merge(
        this.repoId(repoId),
        user.id,
        this.prId(prId),
        fastForwardOnly,
      ),
    );
  }

  @ApiOperation({
    summary: "Pull Request 닫기",
    description: "작성자 본인 또는 write 이상의 권한이 필요합니다.",
  })
  @ApiResponse({ status: 200, schema: apiSchema(PullRequestSchema) })
  @Post(":repoId/pull-requests/:prId/close")
  @HttpCode(HttpStatus.OK)
  close(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.runEffect(
      this.pullRequestService.close(
        this.repoId(repoId),
        user.id,
        this.prId(prId),
      ),
    );
  }

  @ApiOperation({
    summary: "Pull Request 리뷰 작성",
    description:
      "write 이상의 권한이 필요합니다. 같은 리뷰어가 다시 작성하면 기존 리뷰를 덮어씁니다.",
  })
  @ApiBody({ schema: apiSchema(CreateReviewBodySchema) })
  @ApiResponse({ status: 201, schema: apiSchema(ReviewSchema) })
  @Post(":repoId/pull-requests/:prId/reviews")
  @HttpCode(HttpStatus.CREATED)
  review(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const data = this.decode(CreateReviewBodySchema, body);
    return this.runEffect(
      this.pullRequestService.review(
        this.repoId(repoId),
        user.id,
        this.prId(prId),
        data,
      ),
    );
  }

  @ApiOperation({ summary: "Pull Request 리뷰 목록 조회" })
  @ApiResponse({ status: 200, schema: apiSchema(ReviewListSchema) })
  @Get(":repoId/pull-requests/:prId/reviews")
  reviews(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.runEffect(
      this.pullRequestService.reviews(
        this.repoId(repoId),
        user.id,
        this.prId(prId),
      ),
    );
  }

  @ApiOperation({
    summary: "Pull Request의 변경사항 diff",
    description:
      "공유 원격 저장소 기준으로 source 브랜치와 target 브랜치를 비교합니다.",
  })
  @ApiQuery({ name: "path", required: false })
  @ApiResponse({ status: 200, schema: apiSchema(FileDiffListSchema) })
  @Get(":repoId/pull-requests/:prId/diff")
  diff(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { path } = this.decode(PullRequestDiffQuerySchema, query);
    return this.runEffect(
      this.pullRequestService.diff(
        this.repoId(repoId),
        user.id,
        this.prId(prId),
        path,
      ),
    );
  }

  private repoId(raw: string): string {
    return this.decode(RepoIdSchema, raw);
  }

  private prId(raw: string): string {
    return this.decode(PullRequestIdSchema, raw);
  }
}
