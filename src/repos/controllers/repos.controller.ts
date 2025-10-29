import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { Public } from "@src/repos/public.decorator";
import { ReposService } from "@src/repos/repos.service";
import { CreateRepoDto } from "@src/repos/dto/create-repo.dto";
import { ForkRepoDto } from "@src/repos/dto/fork-repo.dto";
import { RepoResponseDto } from "@src/repos/dto/repo-response.dto";
import { User } from "@src/users/entities/user.entity";
import { AuthUser } from "@src/repos/auth-user.decorator";

@ApiTags("Repositories")
@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class ReposController {
  constructor(private readonly reposService: ReposService) {}

  @ApiOperation({ summary: "새 레포지토리 생성" })
  @ApiResponse({
    status: 201,
    description: "레포지토리가 성공적으로 생성됨 (소유자 이메일 포함)",
    type: RepoResponseDto,
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRepo(
    @Body() createRepoDto: CreateRepoDto,
    @AuthUser() user: User,
  ): Promise<RepoResponseDto> {
    return this.reposService.createRepo(createRepoDto, user.id);
  }

  @ApiOperation({
    summary: "레포지토리 삭제",
    description: "레포지토리와 관련된 모든 데이터를 삭제합니다. 로컬 git 디렉토리, 리모트 디렉토리, DB 엔티티가 모두 삭제됩니다."
  })
  @ApiResponse({
    status: 200,
    description: "레포지토리가 성공적으로 삭제됨",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true }
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: "권한 없음 - 레포지토리 소유자만 삭제 가능",
  })
  @ApiResponse({
    status: 404,
    description: "레포지토리를 찾을 수 없음",
  })
  @Delete(":repoId")
  @HttpCode(HttpStatus.OK)
  async deleteRepo(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
  ): Promise<{ success: boolean }> {
    await this.reposService.deleteRepo(repoId, user.id);
    return { success: true };
  }

  @ApiOperation({ summary: "내 레포지토리 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "레포지토리 목록 반환 (소유자 이메일 포함)",
    type: [RepoResponseDto],
  })
  @Get()
  @HttpCode(HttpStatus.OK)
  async getMyRepos(@AuthUser() user: User): Promise<RepoResponseDto[]> {
    return this.reposService.findReposByOwner(user.id);
  }

  @Public()
  @ApiOperation({ summary: "공개 레포지토리 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "공개 레포지토리 목록 반환 (소유자 이메일 포함)",
    type: [RepoResponseDto],
  })
  @Get("public")
  @HttpCode(HttpStatus.OK)
  async getPublicRepos(): Promise<RepoResponseDto[]> {
    return this.reposService.findPublicRepos();
  }

  @Public()
  @ApiOperation({ summary: "특정 사용자의 공개 레포지토리 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "사용자의 공개 레포지토리 목록 반환 (소유자 이메일 포함)",
    type: [RepoResponseDto],
  })
  @Get("public/user/:userId")
  @HttpCode(HttpStatus.OK)
  async getPublicReposByUser(
    @Param("userId") userId: string,
  ): Promise<RepoResponseDto[]> {
    return this.reposService.findPublicReposByOwner(userId);
  }

  @ApiOperation({ summary: "레포지토리 Fork" })
  @ApiResponse({
    status: 201,
    description: "레포지토리가 성공적으로 Fork됨 (소유자 이메일 포함)",
    type: RepoResponseDto,
  })
  @Post("fork")
  @HttpCode(HttpStatus.CREATED)
  async forkRepo(
    @Body() forkRepoDto: ForkRepoDto,
    @AuthUser() user: User,
  ): Promise<RepoResponseDto> {
    return this.reposService.forkRepo(forkRepoDto, user.id);
  }
}