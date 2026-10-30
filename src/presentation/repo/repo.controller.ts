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
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Effect } from "effect";
import { RepoService } from "@src/application/repo/repo.service";
import {
  CreateRepoBodySchema,
  ForkRepoBodySchema,
  RepoIdSchema,
  RepoViewListSchema,
  RepoViewSchema,
  SuccessSchema,
} from "@src/domain/repo/repo";
import type { User } from "@src/domain/user/user";
import { JwtAuthGuard } from "@src/infrastructure/auth/jwt-auth.guard";
import { AuthUser } from "@src/presentation/auth/auth-user.decorator";
import { Public } from "@src/presentation/auth/public.decorator";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";

@ApiTags("Repositories")
@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class RepoController extends BaseController {
  protected readonly logger = new Logger(RepoController.name);

  constructor(private readonly repoService: RepoService) {
    super();
  }

  @ApiOperation({ summary: "새 레포지토리 생성" })
  @ApiBody({ schema: apiSchema(CreateRepoBodySchema) })
  @ApiResponse({
    status: 201,
    description: "레포지토리가 성공적으로 생성됨 (소유자 이메일 포함)",
    schema: apiSchema(RepoViewSchema),
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createRepo(@Body() body: unknown, @AuthUser() user: User) {
    const data = this.decode(CreateRepoBodySchema, body);
    return this.runEffect(this.repoService.create(data, user.id));
  }

  @ApiOperation({
    summary: "레포지토리 삭제",
    description:
      "레포지토리와 관련된 모든 데이터를 삭제합니다. 로컬 git 디렉토리, 리모트 디렉토리, DB 엔티티가 모두 삭제됩니다.",
  })
  @ApiResponse({
    status: 200,
    description: "레포지토리가 성공적으로 삭제됨",
    schema: apiSchema(SuccessSchema),
  })
  @ApiResponse({
    status: 403,
    description: "권한 없음 - 레포지토리 소유자만 삭제 가능",
  })
  @ApiResponse({ status: 404, description: "레포지토리를 찾을 수 없음" })
  @Delete(":repoId")
  @HttpCode(HttpStatus.OK)
  deleteRepo(@Param("repoId") repoId: string, @AuthUser() user: User) {
    const id = this.decode(RepoIdSchema, repoId);
    return this.runEffect(
      this.repoService
        .delete(id, user.id)
        .pipe(Effect.as({ success: true as const })),
    );
  }

  @ApiOperation({ summary: "내 레포지토리 목록 조회 (소유 + 협업)" })
  @ApiResponse({
    status: 200,
    description: "레포지토리 목록 반환 (소유자 이메일 포함)",
    schema: apiSchema(RepoViewListSchema),
  })
  @Get()
  getMyRepos(@AuthUser() user: User) {
    return this.runEffect(this.repoService.listAccessible(user.id));
  }

  @Public()
  @ApiOperation({ summary: "공개 레포지토리 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "공개 레포지토리 목록 반환 (소유자 이메일 포함)",
    schema: apiSchema(RepoViewListSchema),
  })
  @Get("public")
  getPublicRepos() {
    return this.runEffect(this.repoService.listPublic());
  }

  @Public()
  @ApiOperation({ summary: "특정 사용자의 공개 레포지토리 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "사용자의 공개 레포지토리 목록 반환 (소유자 이메일 포함)",
    schema: apiSchema(RepoViewListSchema),
  })
  @Get("public/user/:userId")
  getPublicReposByUser(@Param("userId") userId: string) {
    return this.runEffect(this.repoService.listPublic(userId));
  }

  @ApiOperation({ summary: "레포지토리 Fork" })
  @ApiBody({ schema: apiSchema(ForkRepoBodySchema) })
  @ApiResponse({
    status: 201,
    description: "레포지토리가 성공적으로 Fork됨 (소유자 이메일 포함)",
    schema: apiSchema(RepoViewSchema),
  })
  @ApiResponse({ status: 403, description: "비공개 레포지토리는 Fork 불가" })
  @ApiResponse({ status: 404, description: "원본 레포지토리를 찾을 수 없음" })
  @Post("fork")
  @HttpCode(HttpStatus.CREATED)
  forkRepo(@Body() body: unknown, @AuthUser() user: User) {
    const data = this.decode(ForkRepoBodySchema, body);
    return this.runEffect(this.repoService.fork(data, user.id));
  }
}
