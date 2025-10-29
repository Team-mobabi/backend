import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@src/auth/guards/jwt-auth.guard";
import { CollaboratorService } from "@src/repos/services/collaborator.service";
import { AddCollaboratorDto, UpdateCollaboratorDto } from "@src/repos/dto/collaborator.dto";
import { RepoCollaborator } from "@src/repos/entities/repo-collaborator.entity";
import { User } from "@src/users/entities/user.entity";
import { AuthUser } from "@src/repos/auth-user.decorator";

@ApiTags("Collaborators")
@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class CollaboratorController {
  constructor(
    private readonly collaboratorService: CollaboratorService,
  ) {}

  @ApiOperation({ summary: "협업자 추가" })
  @ApiResponse({
    status: 201,
    description: "협업자가 성공적으로 추가됨",
    type: RepoCollaborator,
  })
  @Post(":repoId/collaborators")
  @HttpCode(HttpStatus.CREATED)
  async addCollaborator(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() dto: AddCollaboratorDto,
  ) {
    return this.collaboratorService.addCollaborator(repoId, user.id, dto);
  }

  @ApiOperation({ summary: "협업자 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "협업자 목록 반환",
    type: [RepoCollaborator],
  })
  @Get(":repoId/collaborators")
  @HttpCode(HttpStatus.OK)
  async getCollaborators(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
  ) {
    return this.collaboratorService.getCollaborators(repoId, user.id);
  }

  @ApiOperation({ summary: "협업자 권한 수정" })
  @ApiResponse({
    status: 200,
    description: "협업자 권한이 성공적으로 수정됨",
    type: RepoCollaborator,
  })
  @Patch(":repoId/collaborators/:userId")
  @HttpCode(HttpStatus.OK)
  async updateCollaborator(
    @Param("repoId") repoId: string,
    @Param("userId") collaboratorUserId: string,
    @AuthUser() user: User,
    @Body() dto: UpdateCollaboratorDto,
  ) {
    return this.collaboratorService.updateCollaborator(
      repoId,
      user.id,
      collaboratorUserId,
      dto,
    );
  }

  @ApiOperation({ summary: "협업자 제거" })
  @ApiResponse({
    status: 200,
    description: "협업자가 성공적으로 제거됨",
  })
  @Delete(":repoId/collaborators/:userId")
  @HttpCode(HttpStatus.OK)
  async removeCollaborator(
    @Param("repoId") repoId: string,
    @Param("userId") collaboratorUserId: string,
    @AuthUser() user: User,
  ) {
    return this.collaboratorService.removeCollaborator(
      repoId,
      user.id,
      collaboratorUserId,
    );
  }
}