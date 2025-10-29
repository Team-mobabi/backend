import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@src/auth/guards/jwt-auth.guard";
import { GitDiffService } from "@src/repos/services/git-diff.service";
import { User } from "@src/users/entities/user.entity";
import { AuthUser } from "@src/repos/auth-user.decorator";

@ApiTags("Diffs")
@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class DiffController {
  constructor(private readonly gitDiffService: GitDiffService) {}

  @ApiOperation({
    summary: "작업 디렉토리 변경사항 diff",
    description: "Unstaged 변경사항의 diff를 조회합니다 (git diff)"
  })
  @ApiResponse({
    status: 200,
    description: "Diff 정보 반환"
  })
  @Get(":repoId/diff/working")
  @HttpCode(HttpStatus.OK)
  async getWorkingDiff(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("path") filePath?: string,
  ) {
    return this.gitDiffService.getWorkingDiff(repoId, user.id, filePath);
  }

  @ApiOperation({
    summary: "Staged 변경사항 diff",
    description: "Staged 변경사항의 diff를 조회합니다 (git diff --cached)"
  })
  @ApiResponse({
    status: 200,
    description: "Diff 정보 반환"
  })
  @Get(":repoId/diff/staged")
  @HttpCode(HttpStatus.OK)
  async getStagedDiff(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("path") filePath?: string,
  ) {
    return this.gitDiffService.getStagedDiff(repoId, user.id, filePath);
  }

  @ApiOperation({
    summary: "두 커밋 간 diff",
    description: `두 커밋 간의 차이를 조회합니다

**예시:**
\`\`\`
GET /repos/:repoId/diff/commits/:commitA/:commitB
GET /repos/:repoId/diff/commits/:commitA/:commitB?path=README.md
\`\`\``
  })
  @ApiResponse({
    status: 200,
    description: "Diff 정보 반환"
  })
  @Get(":repoId/diff/commits/:commitA/:commitB")
  @HttpCode(HttpStatus.OK)
  async getCommitDiff(
    @Param("repoId") repoId: string,
    @Param("commitA") commitA: string,
    @Param("commitB") commitB: string,
    @AuthUser() user: User,
    @Query("path") filePath?: string,
  ) {
    return this.gitDiffService.getCommitDiff(repoId, user.id, commitA, commitB, filePath);
  }

  @ApiOperation({
    summary: "브랜치 간 diff",
    description: "두 브랜치 간의 차이를 조회합니다"
  })
  @ApiResponse({
    status: 200,
    description: "Diff 정보 반환"
  })
  @Get(":repoId/diff/branches")
  @HttpCode(HttpStatus.OK)
  async getBranchDiff(
    @Param("repoId") repoId: string,
    @Query("source") sourceBranch: string,
    @Query("target") targetBranch: string,
    @AuthUser() user: User,
    @Query("path") filePath?: string,
  ) {
    return this.gitDiffService.getBranchDiff(repoId, user.id, sourceBranch, targetBranch, filePath);
  }

  @ApiOperation({
    summary: "특정 커밋의 변경사항",
    description: "특정 커밋에서 변경된 내용을 조회합니다 (부모 커밋과 비교)"
  })
  @ApiResponse({
    status: 200,
    description: "Diff 정보 반환"
  })
  @Get(":repoId/diff/commit/:hash")
  @HttpCode(HttpStatus.OK)
  async getCommitChanges(
    @Param("repoId") repoId: string,
    @Param("hash") commitHash: string,
    @AuthUser() user: User,
    @Query("path") filePath?: string,
  ) {
    return this.gitDiffService.getCommitChanges(repoId, user.id, commitHash, filePath);
  }

  @ApiOperation({
    summary: "변경된 파일 목록",
    description: "변경된 파일 목록만 조회 (diff 내용 없이)"
  })
  @ApiResponse({
    status: 200,
    description: "변경된 파일 목록"
  })
  @Get(":repoId/diff/files")
  @HttpCode(HttpStatus.OK)
  async getChangedFiles(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("commitA") commitA?: string,
    @Query("commitB") commitB?: string,
  ) {
    return this.gitDiffService.getChangedFiles(repoId, user.id, commitA, commitB);
  }

  @ApiOperation({
    summary: "Diff 통계",
    description: "변경사항 통계 정보 (추가/삭제 라인 수)"
  })
  @ApiResponse({
    status: 200,
    description: "통계 정보",
    schema: {
      type: 'object',
      properties: {
        files: { type: 'number', example: 3 },
        additions: { type: 'number', example: 125 },
        deletions: { type: 'number', example: 42 },
        fileStats: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              additions: { type: 'number' },
              deletions: { type: 'number' }
            }
          }
        }
      }
    }
  })
  @Get(":repoId/diff/stats")
  @HttpCode(HttpStatus.OK)
  async getDiffStats(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("commitA") commitA?: string,
    @Query("commitB") commitB?: string,
  ) {
    return this.gitDiffService.getDiffStats(repoId, user.id, commitA, commitB);
  }
}