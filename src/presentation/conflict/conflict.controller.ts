import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
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
import { ConflictService } from "@src/application/conflict/conflict.service";
import { AiSuggestBodySchema, AiSuggestResultSchema } from "@src/domain/ai/ai";
import {
  ConflictActionResultSchema,
  ConflictInfoSchema,
  ResolveConflictBodySchema,
} from "@src/domain/conflict/conflict";
import { RepoIdSchema } from "@src/domain/repo/repo";
import type { User } from "@src/domain/user/user";
import { JwtAuthGuard } from "@src/infrastructure/auth/jwt-auth.guard";
import { AuthUser } from "@src/presentation/auth/auth-user.decorator";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";
import {
  ABORT_DESCRIPTION,
  AI_SUGGEST_DESCRIPTION,
  CONFLICTS_DESCRIPTION,
  RESOLVE_DESCRIPTION,
} from "./conflict.docs";

@ApiTags("Conflicts")
@ApiBearerAuth("JWT-auth")
@ApiParam({ name: "repoId", format: "uuid" })
@ApiResponse({ status: 403, description: "레포지토리 접근 권한 없음" })
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class ConflictController extends BaseController {
  protected readonly logger = new Logger(ConflictController.name);

  constructor(private readonly conflictService: ConflictService) {
    super();
  }

  @ApiOperation({
    summary: "충돌 파일 목록 조회",
    description: CONFLICTS_DESCRIPTION,
  })
  @ApiResponse({ status: 200, schema: apiSchema(ConflictInfoSchema) })
  @Get(":repoId/conflicts")
  getConflicts(@Param("repoId") repoId: string, @AuthUser() user: User) {
    return this.runEffect(
      this.conflictService.list(this.repoId(repoId), user.id),
    );
  }

  @ApiOperation({ summary: "충돌 해결", description: RESOLVE_DESCRIPTION })
  @ApiBody({ schema: apiSchema(ResolveConflictBodySchema) })
  @ApiResponse({ status: 200, schema: apiSchema(ConflictActionResultSchema) })
  @Post(":repoId/conflicts/resolve")
  @HttpCode(HttpStatus.OK)
  resolveConflict(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const data = this.decode(ResolveConflictBodySchema, body);
    return this.runEffect(
      this.conflictService.resolve(this.repoId(repoId), user.id, data),
    );
  }

  @ApiOperation({ summary: "병합 중단", description: ABORT_DESCRIPTION })
  @ApiResponse({ status: 200, schema: apiSchema(ConflictActionResultSchema) })
  @Post(":repoId/merge/abort")
  @HttpCode(HttpStatus.OK)
  abortMerge(@Param("repoId") repoId: string, @AuthUser() user: User) {
    return this.runEffect(
      this.conflictService.abortMerge(this.repoId(repoId), user.id),
    );
  }

  @ApiOperation({
    summary: "AI 충돌 해결 제안",
    description: AI_SUGGEST_DESCRIPTION,
  })
  @ApiBody({ schema: apiSchema(AiSuggestBodySchema) })
  @ApiResponse({ status: 200, schema: apiSchema(AiSuggestResultSchema) })
  @ApiResponse({
    status: 400,
    description: "충돌 마커가 없거나 잘못된 파일 경로",
  })
  @ApiResponse({ status: 502, description: "AI 응답 오류" })
  @ApiResponse({ status: 503, description: "AI 미설정 (CLAUDE_API_KEY)" })
  @Post(":repoId/conflicts/ai-suggest")
  @HttpCode(HttpStatus.OK)
  aiSuggest(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const { filePath } = this.decode(AiSuggestBodySchema, body);
    return this.runEffect(
      this.conflictService.aiSuggest(this.repoId(repoId), user.id, filePath),
    );
  }

  private repoId(raw: string): string {
    return this.decode(RepoIdSchema, raw);
  }
}
