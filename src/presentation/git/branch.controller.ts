import {
  Body,
  Controller,
  Delete,
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
import { BranchService } from "@src/application/git/branch.service";
import {
  BranchListQuerySchema,
  BranchListSchema,
  CreateBranchBodySchema,
  CreateBranchResultSchema,
  DeleteBranchResultSchema,
  GraphQuerySchema,
  MergeBranchBodySchema,
  MergeResultSchema,
  SwitchBranchBodySchema,
  SwitchBranchResultSchema,
} from "@src/domain/git/git";
import { BranchNameSchema } from "@src/domain/git/ref";
import { RepoIdSchema } from "@src/domain/repo/repo";
import type { User } from "@src/domain/user/user";
import { JwtAuthGuard } from "@src/infrastructure/auth/jwt-auth.guard";
import { AuthUser } from "@src/presentation/auth/auth-user.decorator";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";
import { GRAPH_DESCRIPTION, MERGE_DESCRIPTION } from "./git.docs";

@ApiTags("Branches")
@ApiBearerAuth("JWT-auth")
@ApiParam({ name: "repoId", format: "uuid" })
@ApiResponse({ status: 403, description: "레포지토리 접근 권한 없음" })
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class BranchController extends BaseController {
  protected readonly logger = new Logger(BranchController.name);

  constructor(private readonly branchService: BranchService) {
    super();
  }

  @ApiOperation({ summary: "브랜치 목록 조회" })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "브랜치별 커밋 조회 개수 (기본 20)",
  })
  @ApiResponse({ status: 200, schema: apiSchema(BranchListSchema) })
  @Get(":repoId/branches")
  listBranches(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { limit } = this.decode(BranchListQuerySchema, query);
    return this.runEffect(
      this.branchService.list(this.repoId(repoId), user.id, limit),
    );
  }

  @ApiOperation({ summary: "새 브랜치 생성" })
  @ApiBody({ schema: apiSchema(CreateBranchBodySchema) })
  @ApiResponse({ status: 201, schema: apiSchema(CreateBranchResultSchema) })
  @ApiResponse({ status: 409, description: "이미 존재하는 브랜치" })
  @Post(":repoId/branches")
  @HttpCode(HttpStatus.CREATED)
  createBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const { name, from } = this.decode(CreateBranchBodySchema, body);
    return this.runEffect(
      this.branchService.create(this.repoId(repoId), user.id, name, from),
    );
  }

  @ApiOperation({ summary: "브랜치 전환" })
  @ApiBody({ schema: apiSchema(SwitchBranchBodySchema) })
  @ApiResponse({ status: 200, schema: apiSchema(SwitchBranchResultSchema) })
  @Post(":repoId/branches/switch")
  @HttpCode(HttpStatus.OK)
  switchBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const { name } = this.decode(SwitchBranchBodySchema, body);
    return this.runEffect(
      this.branchService.switch(this.repoId(repoId), user.id, name),
    );
  }

  @ApiOperation({ summary: "브랜치 삭제" })
  @ApiResponse({ status: 200, schema: apiSchema(DeleteBranchResultSchema) })
  @Delete(":repoId/branches/:branchName")
  @HttpCode(HttpStatus.OK)
  deleteBranch(
    @Param("repoId") repoId: string,
    @Param("branchName") branchName: string,
    @AuthUser() user: User,
  ) {
    const name = this.decode(BranchNameSchema, branchName);
    return this.runEffect(
      this.branchService.delete(this.repoId(repoId), user.id, name),
    );
  }

  @ApiOperation({ summary: "브랜치 병합", description: MERGE_DESCRIPTION })
  @ApiBody({ schema: apiSchema(MergeBranchBodySchema) })
  @ApiResponse({ status: 200, schema: apiSchema(MergeResultSchema) })
  @ApiResponse({ status: 409, description: "병합 충돌" })
  @Post(":repoId/merge")
  @HttpCode(HttpStatus.OK)
  mergeBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const data = this.decode(MergeBranchBodySchema, body);
    return this.runEffect(
      this.branchService.merge(this.repoId(repoId), user.id, data),
    );
  }

  @ApiOperation({ summary: "커밋 그래프 조회", description: GRAPH_DESCRIPTION })
  @ApiQuery({ name: "since", required: false })
  @ApiQuery({ name: "max", required: false, description: "기본 200" })
  @Get(":repoId/graph")
  graph(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { since, max } = this.decode(GraphQuerySchema, query);
    return this.runEffect(
      this.branchService.graph(this.repoId(repoId), user.id, max, since),
    );
  }

  private repoId(raw: string): string {
    return this.decode(RepoIdSchema, raw);
  }
}
