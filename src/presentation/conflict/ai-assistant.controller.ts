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
import { Effect } from "effect";
import { AiAssistantService } from "@src/application/ai/ai-assistant.service";
import {
  AskQuestionBodySchema,
  AssistantAnswerSchema,
} from "@src/domain/ai/ai";
import { RepoIdSchema } from "@src/domain/repo/repo";
import type { User } from "@src/domain/user/user";
import { JwtAuthGuard } from "@src/infrastructure/auth/jwt-auth.guard";
import { AuthUser } from "@src/presentation/auth/auth-user.decorator";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";
import { ASK_DESCRIPTION, SUGGEST_NEXT_DESCRIPTION } from "./conflict.docs";

@ApiTags("AI Assistant")
@ApiBearerAuth("JWT-auth")
@ApiParam({ name: "repoId", format: "uuid" })
@ApiResponse({ status: 502, description: "AI 응답 오류" })
@ApiResponse({ status: 503, description: "AI 미설정 (CLAUDE_API_KEY)" })
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class AiAssistantController extends BaseController {
  protected readonly logger = new Logger(AiAssistantController.name);

  constructor(private readonly assistant: AiAssistantService) {
    super();
  }

  @ApiOperation({
    summary: "Git 관련 질문에 AI가 답변",
    description: ASK_DESCRIPTION,
  })
  @ApiBody({ schema: apiSchema(AskQuestionBodySchema) })
  @ApiResponse({ status: 200, schema: apiSchema(AssistantAnswerSchema) })
  @Post(":repoId/ai/ask")
  @HttpCode(HttpStatus.OK)
  ask(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const { question } = this.decode(AskQuestionBodySchema, body);
    return this.runEffect(
      this.assistant
        .ask(this.repoId(repoId), user.id, question)
        .pipe(Effect.map((answer) => ({ success: true as const, ...answer }))),
    );
  }

  @ApiOperation({
    summary: "다음에 할 일 제안 받기",
    description: SUGGEST_NEXT_DESCRIPTION,
  })
  @ApiResponse({ status: 200, schema: apiSchema(AssistantAnswerSchema) })
  @Get(":repoId/ai/suggest-next")
  suggestNext(@Param("repoId") repoId: string, @AuthUser() user: User) {
    return this.runEffect(
      this.assistant
        .suggestNext(this.repoId(repoId), user.id)
        .pipe(Effect.map((answer) => ({ success: true as const, ...answer }))),
    );
  }

  private repoId(raw: string): string {
    return this.decode(RepoIdSchema, raw);
  }
}
