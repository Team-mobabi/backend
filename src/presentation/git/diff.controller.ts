import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { GitDiffService } from "@src/application/git/git-diff.service";
import {
  ChangedFileListSchema,
  DiffStatsSchema,
  FileDiffListSchema,
} from "@src/domain/git/diff";
import {
  BranchDiffQuerySchema,
  CommitRangeQuerySchema,
  DiffPathQuerySchema,
} from "@src/domain/git/git";
import { RevisionSchema } from "@src/domain/git/ref";
import { RepoIdSchema } from "@src/domain/repo/repo";
import type { User } from "@src/domain/user/user";
import { JwtAuthGuard } from "@src/infrastructure/auth/jwt-auth.guard";
import { AuthUser } from "@src/presentation/auth/auth-user.decorator";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";

const pathQuery = ApiQuery({
  name: "path",
  required: false,
  description: "특정 파일만 비교",
});

@ApiTags("Diff")
@ApiBearerAuth("JWT-auth")
@ApiParam({ name: "repoId", format: "uuid" })
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class DiffController extends BaseController {
  protected readonly logger = new Logger(DiffController.name);

  constructor(private readonly gitDiffService: GitDiffService) {
    super();
  }

  @ApiOperation({
    summary: "작업 디렉토리 변경사항 diff",
    description: "Unstaged 변경사항을 조회합니다.",
  })
  @pathQuery
  @ApiResponse({ status: 200, schema: apiSchema(FileDiffListSchema) })
  @Get(":repoId/diff/working")
  working(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { path } = this.decode(DiffPathQuerySchema, query);
    return this.runEffect(
      this.gitDiffService.working(this.repoId(repoId), user.id, path),
    );
  }

  @ApiOperation({
    summary: "Staged 변경사항 diff",
    description: "커밋 대기 중인 변경사항을 조회합니다.",
  })
  @pathQuery
  @ApiResponse({ status: 200, schema: apiSchema(FileDiffListSchema) })
  @Get(":repoId/diff/staged")
  staged(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { path } = this.decode(DiffPathQuerySchema, query);
    return this.runEffect(
      this.gitDiffService.staged(this.repoId(repoId), user.id, path),
    );
  }

  @ApiOperation({
    summary: "두 커밋 간 diff",
    description: "commitA에서 commitB로의 변경사항을 조회합니다.",
  })
  @pathQuery
  @ApiResponse({ status: 200, schema: apiSchema(FileDiffListSchema) })
  @Get(":repoId/diff/commits/:commitA/:commitB")
  between(
    @Param("repoId") repoId: string,
    @Param("commitA") commitA: string,
    @Param("commitB") commitB: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { path } = this.decode(DiffPathQuerySchema, query);
    return this.runEffect(
      this.gitDiffService.between(
        this.repoId(repoId),
        user.id,
        this.decode(RevisionSchema, commitA),
        this.decode(RevisionSchema, commitB),
        path,
      ),
    );
  }

  @ApiOperation({
    summary: "브랜치 간 diff",
    description: "target 브랜치 대비 source 브랜치의 변경사항",
  })
  @ApiQuery({ name: "source", required: true })
  @ApiQuery({ name: "target", required: true })
  @pathQuery
  @ApiResponse({ status: 200, schema: apiSchema(FileDiffListSchema) })
  @Get(":repoId/diff/branches")
  branches(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { source, target, path } = this.decode(BranchDiffQuerySchema, query);
    return this.runEffect(
      this.gitDiffService.branches(
        this.repoId(repoId),
        user.id,
        source,
        target,
        path,
      ),
    );
  }

  @ApiOperation({
    summary: "특정 커밋의 변경사항",
    description: "부모 커밋 대비 변경사항",
  })
  @pathQuery
  @ApiResponse({ status: 200, schema: apiSchema(FileDiffListSchema) })
  @Get(":repoId/diff/commit/:hash")
  commit(
    @Param("repoId") repoId: string,
    @Param("hash") hash: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { path } = this.decode(DiffPathQuerySchema, query);
    return this.runEffect(
      this.gitDiffService.commit(
        this.repoId(repoId),
        user.id,
        this.decode(RevisionSchema, hash),
        path,
      ),
    );
  }

  @ApiOperation({
    summary: "변경된 파일 목록",
    description: "commitA만 주면 그 커밋의 변경 파일, 둘 다 주면 범위 비교",
  })
  @ApiQuery({ name: "commitA", required: false })
  @ApiQuery({ name: "commitB", required: false })
  @ApiResponse({ status: 200, schema: apiSchema(ChangedFileListSchema) })
  @Get(":repoId/diff/files")
  changedFiles(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { commitA, commitB } = this.decode(CommitRangeQuerySchema, query);
    return this.runEffect(
      this.gitDiffService.changedFiles(
        this.repoId(repoId),
        user.id,
        commitA,
        commitB,
      ),
    );
  }

  @ApiOperation({ summary: "Diff 통계", description: "추가/삭제 줄 수 통계" })
  @ApiQuery({ name: "commitA", required: false })
  @ApiQuery({ name: "commitB", required: false })
  @ApiResponse({ status: 200, schema: apiSchema(DiffStatsSchema) })
  @Get(":repoId/diff/stats")
  stats(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { commitA, commitB } = this.decode(CommitRangeQuerySchema, query);
    return this.runEffect(
      this.gitDiffService.stats(this.repoId(repoId), user.id, commitA, commitB),
    );
  }

  private repoId(raw: string): string {
    return this.decode(RepoIdSchema, raw);
  }
}
