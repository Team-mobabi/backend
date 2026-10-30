import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { GitOperationService } from "@src/application/git/git-operation.service";
import { GitRemoteService } from "@src/application/git/git-remote.service";
import {
  AddBodySchema,
  AddRemoteBodySchema,
  AddResultSchema,
  CommitBodySchema,
  CommitResultSchema,
  CreateLocalRemoteBodySchema,
  LocalRemoteResultSchema,
  PullBodySchema,
  PullResultSchema,
  PushBodySchema,
  PushResultSchema,
  ResetBodySchema,
  ResetResultSchema,
  StatusResultSchema,
} from "@src/domain/git/git";
import { RepoIdSchema } from "@src/domain/repo/repo";
import type { User } from "@src/domain/user/user";
import { JwtAuthGuard } from "@src/infrastructure/auth/jwt-auth.guard";
import { AuthUser } from "@src/presentation/auth/auth-user.decorator";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";
import {
  PULL_DESCRIPTION,
  PUSH_DESCRIPTION,
  RESET_DESCRIPTION,
  STATUS_DESCRIPTION,
} from "./git.docs";

@ApiTags("Git Operations")
@ApiBearerAuth("JWT-auth")
@ApiParam({ name: "repoId", format: "uuid" })
@ApiResponse({ status: 403, description: "레포지토리 접근 권한 없음" })
@ApiResponse({ status: 404, description: "레포지토리를 찾을 수 없음" })
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class GitController extends BaseController {
  protected readonly logger = new Logger(GitController.name);

  constructor(
    private readonly gitOperationService: GitOperationService,
    private readonly gitRemoteService: GitRemoteService,
  ) {
    super();
  }

  @ApiOperation({ summary: "파일 스테이징" })
  @ApiBody({ schema: apiSchema(AddBodySchema) })
  @ApiResponse({ status: 200, schema: apiSchema(AddResultSchema) })
  @Post(":repoId/add")
  @HttpCode(HttpStatus.OK)
  add(
    @Param("repoId") repoId: string,
    @Body() body: unknown,
    @AuthUser() user: User,
  ) {
    const { files } = this.decode(AddBodySchema, body);
    return this.runEffect(
      this.gitOperationService.add(this.repoId(repoId), user.id, files),
    );
  }

  @ApiOperation({ summary: "변경사항 커밋" })
  @ApiBody({ schema: apiSchema(CommitBodySchema) })
  @ApiResponse({ status: 200, schema: apiSchema(CommitResultSchema) })
  @ApiResponse({ status: 400, description: "커밋할 변경사항이 없음" })
  @Post(":repoId/commit")
  @HttpCode(HttpStatus.OK)
  commit(
    @Param("repoId") repoId: string,
    @Body() body: unknown,
    @AuthUser() user: User,
  ) {
    const data = this.decode(CommitBodySchema, body);
    return this.runEffect(
      this.gitOperationService.commit(this.repoId(repoId), user, data),
    );
  }

  @ApiOperation({
    summary: "특정 커밋으로 되돌리기 (Git Reset)",
    description: RESET_DESCRIPTION,
  })
  @ApiBody({ schema: apiSchema(ResetBodySchema) })
  @ApiResponse({ status: 200, schema: apiSchema(ResetResultSchema) })
  @Post(":repoId/reset")
  @HttpCode(HttpStatus.OK)
  reset(
    @Param("repoId") repoId: string,
    @Body() body: unknown,
    @AuthUser() user: User,
  ) {
    const { commitHash, mode } = this.decode(ResetBodySchema, body);
    return this.runEffect(
      this.gitOperationService.reset(
        this.repoId(repoId),
        user.id,
        commitHash,
        mode,
      ),
    );
  }

  @ApiOperation({ summary: "리모트 저장소 등록 (http/https만 허용)" })
  @ApiBody({ schema: apiSchema(AddRemoteBodySchema) })
  @ApiResponse({ status: 204, description: "리모트가 성공적으로 등록됨" })
  @Post(":repoId/remote")
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerRemote(
    @Param("repoId") repoId: string,
    @Body() body: unknown,
    @AuthUser() user: User,
  ): Promise<void> {
    const { url, name } = this.decode(AddRemoteBodySchema, body);
    await this.runEffect(
      this.gitRemoteService.addRemote(this.repoId(repoId), user.id, url, name),
    );
  }

  @ApiOperation({ summary: "로컬 리모트 저장소 연결" })
  @ApiBody({ schema: apiSchema(CreateLocalRemoteBodySchema) })
  @ApiResponse({ status: 201, schema: apiSchema(LocalRemoteResultSchema) })
  @Post(":repoId/remote-local")
  @HttpCode(HttpStatus.CREATED)
  createLocalRemote(
    @Param("repoId") repoId: string,
    @Body() body: unknown,
    @AuthUser() user: User,
  ) {
    const { name } = this.decode(CreateLocalRemoteBodySchema, body);
    return this.runEffect(
      this.gitRemoteService.connectLocalRemote(
        this.repoId(repoId),
        user.id,
        name,
      ),
    );
  }

  @ApiOperation({
    summary: "원격 저장소에서 Pull",
    description: PULL_DESCRIPTION,
  })
  @ApiBody({ schema: apiSchema(PullBodySchema) })
  @ApiResponse({ status: 200, schema: apiSchema(PullResultSchema) })
  @ApiResponse({ status: 204, description: "이미 최신 상태" })
  @Post(":repoId/pull")
  @HttpCode(HttpStatus.OK)
  async pull(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = this.decode(PullBodySchema, body);
    const outcome = await this.runEffect(
      this.gitRemoteService.pull(this.repoId(repoId), user.id, data),
    );
    if ("success" in outcome) return outcome;
    res.status(HttpStatus.NO_CONTENT);
    return undefined;
  }

  @ApiOperation({
    summary: "원격 저장소로 Push",
    description: `${PUSH_DESCRIPTION}\n\n**권한:** write 이상의 협업자 또는 소유자만 push할 수 있습니다.`,
  })
  @ApiBody({ schema: apiSchema(PushBodySchema) })
  @ApiResponse({ status: 200, schema: apiSchema(PushResultSchema) })
  @ApiResponse({ status: 409, description: "Push 거부 (non-fast-forward 등)" })
  @Post(":repoId/push")
  @HttpCode(HttpStatus.OK)
  push(
    @Param("repoId") repoId: string,
    @Body() body: unknown,
    @AuthUser() user: User,
  ) {
    const data = this.decode(PushBodySchema, body);
    return this.runEffect(
      this.gitRemoteService.push(this.repoId(repoId), user.id, data),
    );
  }

  @ApiOperation({
    summary: "저장소 상태 조회",
    description: STATUS_DESCRIPTION,
  })
  @ApiResponse({ status: 200, schema: apiSchema(StatusResultSchema) })
  @Get(":repoId/status")
  getStatus(@Param("repoId") repoId: string, @AuthUser() user: User) {
    return this.runEffect(
      this.gitOperationService.status(this.repoId(repoId), user.id),
    );
  }

  private repoId(raw: string): string {
    return this.decode(RepoIdSchema, raw);
  }
}
