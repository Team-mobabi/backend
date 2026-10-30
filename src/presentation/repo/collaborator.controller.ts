import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
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
import { CollaboratorService } from "@src/application/repo/collaborator.service";
import {
  AddCollaboratorBodySchema,
  CollaboratorListSchema,
  CollaboratorSchema,
  RemoveCollaboratorResultSchema,
  UpdateCollaboratorBodySchema,
} from "@src/domain/repo/collaborator";
import { RepoIdSchema } from "@src/domain/repo/repo";
import type { User } from "@src/domain/user/user";
import { JwtAuthGuard } from "@src/infrastructure/auth/jwt-auth.guard";
import { AuthUser } from "@src/presentation/auth/auth-user.decorator";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";

@ApiTags("Collaborators")
@ApiBearerAuth("JWT-auth")
@ApiParam({ name: "repoId", format: "uuid" })
@ApiResponse({ status: 403, description: "권한 없음 (변경은 admin 이상)" })
@ApiResponse({ status: 404, description: "레포지토리 또는 협업자 없음" })
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class CollaboratorController extends BaseController {
  protected readonly logger = new Logger(CollaboratorController.name);

  constructor(private readonly collaboratorService: CollaboratorService) {
    super();
  }

  @ApiOperation({ summary: "협업자 추가" })
  @ApiBody({ schema: apiSchema(AddCollaboratorBodySchema) })
  @ApiResponse({
    status: 201,
    description: "협업자가 성공적으로 추가됨",
    schema: apiSchema(CollaboratorSchema),
  })
  @ApiResponse({ status: 409, description: "소유자이거나 이미 협업자임" })
  @Post(":repoId/collaborators")
  @HttpCode(HttpStatus.CREATED)
  addCollaborator(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const data = this.decode(AddCollaboratorBodySchema, body);
    return this.runEffect(
      this.collaboratorService.add(this.repoId(repoId), user.id, data),
    );
  }

  @ApiOperation({ summary: "협업자 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "협업자 목록 반환",
    schema: apiSchema(CollaboratorListSchema),
  })
  @Get(":repoId/collaborators")
  getCollaborators(@Param("repoId") repoId: string, @AuthUser() user: User) {
    return this.runEffect(
      this.collaboratorService.list(this.repoId(repoId), user.id),
    );
  }

  @ApiOperation({ summary: "협업자 권한 수정" })
  @ApiBody({ schema: apiSchema(UpdateCollaboratorBodySchema) })
  @ApiResponse({
    status: 200,
    description: "협업자 권한이 성공적으로 수정됨",
    schema: apiSchema(CollaboratorSchema),
  })
  @Patch(":repoId/collaborators/:userId")
  updateCollaborator(
    @Param("repoId") repoId: string,
    @Param("userId") collaboratorUserId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const { role } = this.decode(UpdateCollaboratorBodySchema, body);
    return this.runEffect(
      this.collaboratorService.updateRole(
        this.repoId(repoId),
        user.id,
        collaboratorUserId,
        role,
      ),
    );
  }

  @ApiOperation({ summary: "협업자 제거" })
  @ApiResponse({
    status: 200,
    description: "협업자가 성공적으로 제거됨",
    schema: apiSchema(RemoveCollaboratorResultSchema),
  })
  @Delete(":repoId/collaborators/:userId")
  removeCollaborator(
    @Param("repoId") repoId: string,
    @Param("userId") collaboratorUserId: string,
    @AuthUser() user: User,
  ) {
    return this.runEffect(
      this.collaboratorService.remove(
        this.repoId(repoId),
        user.id,
        collaboratorUserId,
      ),
    );
  }

  private repoId(raw: string): string {
    return this.decode(RepoIdSchema, raw);
  }
}
