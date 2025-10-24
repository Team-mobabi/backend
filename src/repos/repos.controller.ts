import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";
import { FilesInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "@src/auth/guards/jwt-auth.guard";
import { Public } from "@src/repos/public.decorator";
import { ReposService } from "@src/repos/repos.service";
import { GitRemoteService } from "@src/repos/services/git-remote.service";
import { GitOperationService } from "@src/repos/services/git-operation.service";
import { BranchService } from "@src/repos/services/branch.service";
import { PullRequestService } from "@src/repos/services/pull-request.service";
import { FileService } from "@src/repos/services/file.service";
import { GitConflictService } from "@src/repos/services/git-conflict.service";
import { AIConflictResolverService } from "@src/repos/services/ai-conflict-resolver.service";
import { GitDiffService } from "@src/repos/services/git-diff.service";
import { Repo } from "@src/repos/entities/repo.entity";
import { CreateRepoDto } from "@src/repos/dto/create-repo.dto";
import { ForkRepoDto } from "@src/repos/dto/fork-repo.dto";
import { AddRemoteDto } from "@src/repos/dto/add-remote.dto";
import { PushDto } from "@src/repos/dto/push.dto";
import { PullDto } from "@src/repos/dto/pull.dto";
import { MergeResponse, PullResponse } from "@src/repos/dto/responses.dto";
import { RepoResponseDto } from "@src/repos/dto/repo-response.dto";
import { CreateLocalRemoteDto } from "@src/repos/dto/create-local-remote.dto";
import { AddDto } from "@src/repos/dto/add.dto";
import { CommitDto } from "@src/repos/dto/commit.dto";
import { ResetDto } from "@src/repos/dto/reset.dto";
import { CreatePullRequestDto } from "@src/repos/dto/create-pull-request.dto";
import { MergePullRequestDto } from "@src/repos/dto/merge-pull-request.dto";
import { CreateReviewDto } from "@src/repos/dto/create-review.dto";
import { PullRequestStatus, PullRequest } from "@src/repos/entities/pull-request.entity";
import { PrReview } from "@src/repos/entities/pr-review.entity";
import { User } from "@src/users/entities/user.entity";
import { AuthUser } from "@src/repos/auth-user.decorator";
import {
  CreateFileDto,
  UpdateFileDto,

} from "@src/repos/dto/file-operation.dto";
import { CreateBranchDto } from "@src/repos/dto/create-branch.dto";
import { SwitchBranchDto } from "@src/repos/dto/switch-branch.dto";
import { MergeBranchDto } from "@src/repos/dto/merge-branch.dto";

@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class ReposController {
  constructor(
    private readonly reposService: ReposService,
    private readonly gitRemoteService: GitRemoteService,
    private readonly gitOperationService: GitOperationService,
    private readonly branchService: BranchService,
    private readonly pullRequestService: PullRequestService,
    private readonly fileService: FileService,
    private readonly gitConflictService: GitConflictService,
    private readonly aiConflictResolver: AIConflictResolverService,
    private readonly gitDiffService: GitDiffService,
  ) {}

  @ApiTags("Repositories")
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

  @ApiTags("Repositories")
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

  @ApiTags("Repositories")
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
  @ApiTags("Repositories")
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
  @ApiTags("Repositories")
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

  @ApiTags("Repositories")
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

  @ApiTags("Commits")
  @ApiOperation({ summary: "파일 스테이징" })
  @ApiResponse({ status: 200, description: "파일이 성공적으로 스테이징됨" })
  @Post(":repoId/add")
  @HttpCode(HttpStatus.OK)
  async addFiles(
    @Param("repoId") repoId: string,
    @Body() addDto: AddDto,
    @AuthUser() user: User,
  ) {
    return this.gitOperationService.addFiles(repoId, user.id, addDto.files);
  }

  @ApiTags("Commits")
  @ApiOperation({ summary: "변경사항 커밋" })
  @ApiResponse({ status: 200, description: "커밋이 성공적으로 생성됨" })
  @Post(":repoId/commit")
  @HttpCode(HttpStatus.OK)
  async commit(
    @Param("repoId") repoId: string,
    @Body() commitDto: CommitDto,
    @AuthUser() user: User,
  ) {
    return this.gitOperationService.commit(
      repoId,
      user.id,
      commitDto.message,
      commitDto.branch,
    );
  }

  @ApiTags("Commits")
  @ApiOperation({
    summary: "특정 커밋으로 되돌리기 (Git Reset)",
    description: `특정 커밋 시점으로 HEAD를 이동시킵니다.

**⚠️ 주의사항:**
- **히스토리가 변경됩니다**. 이미 push된 커밋을 reset하면 문제가 발생할 수 있습니다.
- 협업 시에는 revert 사용을 권장합니다.

**Reset 모드:**

1. **Hard** (\`--hard\`)
   - 작업 디렉토리까지 완전히 되돌림
   - 커밋 + Staged + Unstaged 변경사항 모두 삭제
   - ⚠️ 데이터 손실 가능성 있음

2. **Soft** (\`--soft\`)
   - 커밋만 취소, 변경사항은 Staged 상태로 유지
   - 커밋 메시지 수정이나 다시 커밋할 때 유용

3. **Mixed** (\`--mixed\`, 기본값)
   - 커밋 취소, 변경사항은 Unstaged 상태로 유지
   - 파일은 그대로 유지되지만 git add는 취소됨

**요청 예시:**
\`\`\`json
{
  "commitHash": "abc1234",
  "mode": "hard"
}
\`\`\`

**응답 예시:**
\`\`\`json
{
  "success": true,
  "mode": "hard",
  "from": "def5678",
  "to": "abc1234",
  "branch": "main",
  "modified": [],
  "staged": [],
  "message": "Hard reset: def5678 → abc1234 (작업 디렉토리까지 완전히 되돌림)"
}
\`\`\`

**사용 시나리오:**
- 최근 커밋을 취소하고 다시 작업하고 싶을 때
- 잘못된 커밋을 완전히 제거하고 싶을 때 (hard)
- 커밋은 취소하되 변경사항은 유지하고 싶을 때 (soft/mixed)
`
  })
  @ApiResponse({
    status: 200,
    description: "Reset이 성공적으로 완료됨",
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        mode: { type: 'string', enum: ['hard', 'soft', 'mixed'], example: 'hard' },
        from: { type: 'string', example: 'def5678', description: 'Reset 전 커밋 해시' },
        to: { type: 'string', example: 'abc1234', description: 'Reset 후 커밋 해시' },
        branch: { type: 'string', example: 'main', description: '현재 브랜치' },
        modified: { type: 'array', items: { type: 'string' }, description: 'Modified 파일 목록' },
        staged: { type: 'array', items: { type: 'string' }, description: 'Staged 파일 목록' },
        message: { type: 'string', example: 'Hard reset: def5678 → abc1234 (작업 디렉토리까지 완전히 되돌림)' }
      }
    }
  })
  @ApiResponse({
    status: 404,
    description: "커밋을 찾을 수 없음"
  })
  @Post(":repoId/reset")
  @HttpCode(HttpStatus.OK)
  async reset(
    @Param("repoId") repoId: string,
    @Body() resetDto: ResetDto,
    @AuthUser() user: User,
  ) {
    return this.gitOperationService.resetToCommit(
      repoId,
      user.id,
      resetDto.commitHash,
      resetDto.mode,
    );
  }

  @ApiTags("Remotes")
  @ApiOperation({ summary: "리모트 저장소 등록" })
  @ApiResponse({ status: 204, description: "리모트가 성공적으로 등록됨" })
  @Post(":repoId/remote")
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerRemote(
    @Param("repoId") repoId: string,
    @Body() addRemoteDto: AddRemoteDto,
    @AuthUser() user: User,
  ) {
    await this.gitRemoteService.addRemote(
      repoId,
      user.id,
      addRemoteDto.url,
      addRemoteDto.name,
    );
  }

  @ApiTags("Pull")
  @ApiOperation({
    summary: "원격 저장소에서 Pull",
    description: `원격 저장소의 변경사항을 로컬로 가져옵니다.

**요청 예시:**
\`\`\`json
{
  "remote": "origin",      // 선택사항, 기본값: "origin"
  "branch": "main",        // 선택사항, 생략시 현재 브랜치
  "ffOnly": false          // 선택사항, fast-forward only 여부
}
\`\`\`

**빈 객체로 요청 (현재 브랜치 pull):**
\`\`\`json
{}
\`\`\`

**응답 예시 (충돌 없음):**
\`\`\`json
{
  "success": true,
  "fastForward": true,
  "from": "abc123",
  "to": "def456",
  "hasConflict": false,
  "conflictFiles": []
}
\`\`\`

**응답 예시 (충돌 발생):**
\`\`\`json
{
  "success": true,
  "fastForward": false,
  "from": "abc123",
  "to": "def456",
  "hasConflict": true,
  "conflictFiles": ["file1.txt", "file2.js"]
}
\`\`\`

**curl 예시:**
\`\`\`bash
curl -X POST "http://localhost:6101/repos/:repoId/pull" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"remote": "origin", "branch": "main"}'
\`\`\`
`
  })
  @ApiResponse({
    status: 200,
    description: "Pull이 완료됨. 응답에 충돌 정보 포함됨 (hasConflict, conflictFiles)",
    type: PullResponse,
  })
  @Post(":repoId/pull")
  @HttpCode(HttpStatus.OK)
  pull(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() pullDto: PullDto,
  ): Promise<PullResponse> {
    return this.gitRemoteService.pullRepo(
      repoId,
      user.id,
      pullDto.remote,
      pullDto.branch,
      pullDto.ffOnly,
    );
  }

  @ApiTags("Status")
  @ApiOperation({
    summary: "저장소 상태 조회",
    description: `저장소의 현재 상태와 파일 목록을 반환합니다.

**반환 데이터:**
\`\`\`json
{
  "files": [          // 변경사항 목록 (git status 결과) - 이전 버전 호환
    { "name": "file.txt", "status": "modified" },
    { "name": "new.txt", "status": "untracked" }
  ],
  "allFiles": [       // 전체 파일 목록 (커밋된 파일 포함) - 새로 추가
    "file.txt",
    "folder/file2.txt"
  ],
  "isEmpty": false    // 저장소가 비어있는지 - 새로 추가
}
\`\`\`

**활용:**
- \`isEmpty\`: 초기 업로드 화면 표시 여부 결정
- \`allFiles\`: 저장소 전체 파일 목록 (커밋된 파일 포함)
- \`files\`: 변경된 파일만 표시 (git add 대상)
`
  })
  @ApiResponse({ status: 200, description: "저장소 상태 반환" })
  @Get(":repoId/status")
  async getStatus(@Param("repoId") repoId: string, @AuthUser() user: User) {
    return this.gitOperationService.status(repoId, user.id);
  }

  @ApiTags("Push")
  @ApiOperation({
    summary: "원격 저장소로 Push",
    description: `로컬 변경사항을 원격 저장소로 업로드합니다.

**요청 예시:**
\`\`\`json
{
  "remote": "origin",   // 선택사항, 기본값: "origin"
  "branch": "main"      // 선택사항, 생략시 현재 브랜치
}
\`\`\`

**빈 객체로 요청 (현재 브랜치 push):**
\`\`\`json
{}
\`\`\`

**curl 예시:**
\`\`\`bash
curl -X POST "http://localhost:6101/repos/:repoId/push" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"remote": "origin", "branch": "main"}'
\`\`\`

**참고:** upstream이 설정되지 않은 경우 자동으로 \`--set-upstream\` 옵션이 적용됩니다.
`
  })
  @ApiResponse({ status: 200, description: "Push가 성공적으로 완료됨" })
  @Post(":repoId/push")
  @HttpCode(HttpStatus.OK)
  async push(
    @Param("repoId") repoId: string,
    @Body() pushDto: PushDto,
    @AuthUser() user: User,
  ) {
    return this.gitRemoteService.pushRepo(
      repoId,
      user.id,
      pushDto.remote,
      pushDto.branch,
    );
  }

  @ApiTags("Branches")
  @ApiOperation({ summary: "브랜치 목록 조회" })
  @ApiResponse({ status: 200, description: "브랜치 목록 및 최근 커밋 반환" })
  @Get(":repoId/branches")
  @HttpCode(HttpStatus.OK)
  async listBranches(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("limit") limit?: string,
  ) {
    const commitLimit = limit ? Number(limit) : 20;
    return this.branchService.getBranches(repoId, user.id, commitLimit);
  }

  @ApiTags("Status")
  @ApiOperation({
    summary: "커밋 그래프 조회",
    description: `
로컬과 원격 레포지토리의 커밋 그래프를 조회합니다.
각 브랜치별로 커밋 히스토리를 배열 형태로 반환하며, 오래된 커밋부터 최신 커밋 순서로 정렬됩니다.

**쿼리 파라미터:**
- \`since\`: 특정 커밋 이후의 커밋만 조회 (optional)
- \`max\`: 최대 커밋 개수 (기본값: 200)

**응답 구조:**
\`\`\`json
{
  "local": {
    "branches": {
      "main": [
        {
          "hash": "커밋 해시",
          "message": "커밋 메시지",
          "author": "작성자",
          "committedAt": "커밋 시간",
          "parents": ["부모 커밋 해시"],
          "files": []
        }
      ]
    }
  },
  "remote": {
    "branches": {
      "main": [...]
    }
  }
}
\`\`\`
    `
  })
  @ApiResponse({
    status: 200,
    description: "커밋 그래프가 성공적으로 반환됨",
    schema: {
      type: 'object',
      properties: {
        local: {
          type: 'object',
          properties: {
            branches: {
              type: 'object',
              additionalProperties: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    hash: { type: 'string', example: '3bad3d6d1840f8a0d628d3365c577871c8647ded', description: '커밋 해시' },
                    message: { type: 'string', example: 'Initial commit', description: '커밋 메시지' },
                    author: { type: 'string', example: 'John Doe', description: '커밋 작성자' },
                    committedAt: { type: 'string', example: '2025-10-11 23:33:05 +0900', description: '커밋 시간' },
                    parents: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['6b0d8081f8ef8e185a24cd2fe5e3eb06a266f192'],
                      description: '부모 커밋 해시 배열'
                    },
                    files: {
                      type: 'array',
                      items: { type: 'string' },
                      example: [],
                      description: '변경된 파일 목록'
                    }
                  }
                }
              },
              example: {
                main: [
                  {
                    hash: '6b0d8081f8ef8e185a24cd2fe5e3eb06a266f192',
                    message: 'Initial commit',
                    author: 'pingmong',
                    committedAt: '2025-10-11 23:19:30 +0900',
                    parents: [],
                    files: []
                  },
                  {
                    hash: '3bad3d6d1840f8a0d628d3365c577871c8647ded',
                    message: 'Add feature',
                    author: 'pingmong',
                    committedAt: '2025-10-11 23:33:05 +0900',
                    parents: ['6b0d8081f8ef8e185a24cd2fe5e3eb06a266f192'],
                    files: []
                  }
                ]
              }
            }
          },
          description: '로컬 레포지토리의 브랜치별 커밋 히스토리'
        },
        remote: {
          type: 'object',
          properties: {
            branches: {
              type: 'object',
              additionalProperties: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    hash: { type: 'string', description: '커밋 해시' },
                    message: { type: 'string', description: '커밋 메시지' },
                    author: { type: 'string', description: '커밋 작성자' },
                    committedAt: { type: 'string', description: '커밋 시간' },
                    parents: { type: 'array', items: { type: 'string' }, description: '부모 커밋 해시 배열' },
                    files: { type: 'array', items: { type: 'string' }, description: '변경된 파일 목록' }
                  }
                }
              }
            }
          },
          description: '원격 레포지토리의 브랜치별 커밋 히스토리'
        }
      }
    }
  })
  @Get(":repoId/graph")
  @HttpCode(HttpStatus.OK)
  async graph(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("since") since?: string,
    @Query("max") max?: string,
  ) {
    return this.branchService.getGraph(
      repoId,
      user.id,
      since,
      Number(max) || 200,
    );
  }

  @ApiTags("Remotes")
  @ApiOperation({ summary: "로컬 리모트 저장소 생성" })
  @ApiResponse({ status: 201, description: "로컬 리모트가 성공적으로 생성됨" })
  @Post(":repoId/remote-local")
  @HttpCode(HttpStatus.CREATED)
  async createLocalRemote(
    @Param("repoId") repoId: string,
    @Body() createLocalRemoteDto: CreateLocalRemoteDto,
    @AuthUser() user: User,
  ) {
    const remoteInfo = await this.gitRemoteService.createLocalRemote(
      repoId,
      user.id,
      createLocalRemoteDto.name,
    );
    return {
      success: true,
      remotePath: remoteInfo.path,
      remoteName: remoteInfo.name,
    };
  }

  @ApiTags("Branches")
  @ApiOperation({ summary: "새 브랜치 생성" })
  @ApiResponse({ status: 201, description: "브랜치가 성공적으로 생성됨" })
  @Post(":repoId/branches")
  @HttpCode(HttpStatus.CREATED)
  async createBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() createBranchDto: CreateBranchDto,
  ) {
    return this.branchService.createBranch(
      repoId,
      user.id,
      createBranchDto.name,
      createBranchDto.from,
    );
  }

  @ApiTags("Branches")
  @ApiOperation({ summary: "브랜치 전환" })
  @ApiResponse({ status: 200, description: "브랜치가 성공적으로 전환됨" })
  @Post(":repoId/branches/switch")
  @HttpCode(HttpStatus.OK)
  async switchBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() switchBranchDto: SwitchBranchDto,
  ) {
    return this.branchService.switchBranch(repoId, user.id, switchBranchDto.name);
  }

  @ApiTags("Branches")
  @ApiOperation({ summary: "브랜치 삭제" })
  @ApiResponse({ status: 200, description: "브랜치가 성공적으로 삭제됨" })
  @Delete(":repoId/branches/:branchName")
  @HttpCode(HttpStatus.OK)
  async deleteBranch(
    @Param("repoId") repoId: string,
    @Param("branchName") branchName: string,
    @AuthUser() user: User,
  ) {
    return this.branchService.deleteBranch(repoId, user.id, branchName);
  }

  @ApiTags("Branches")
  @ApiOperation({
    summary: "브랜치 병합",
    description: `소스 브랜치를 타겟 브랜치로 병합합니다.

**응답 예시 (충돌 없음):**
\`\`\`json
{
  "success": true,
  "fastForward": false,
  "from": "abc123",
  "to": "def456",
  "sourceBranch": "feature",
  "targetBranch": "main",
  "hasConflict": false,
  "conflictFiles": []
}
\`\`\`

**응답 예시 (충돌 발생):**
\`\`\`json
{
  "success": true,
  "fastForward": false,
  "from": "abc123",
  "to": "def456",
  "sourceBranch": "feature",
  "targetBranch": "main",
  "hasConflict": true,
  "conflictFiles": ["file1.txt", "file2.js"]
}
\`\`\`

**충돌 처리:**
- \`hasConflict: true\`인 경우 \`/repos/:repoId/conflicts/ai-suggest\` API로 AI 해결 제안을 받을 수 있습니다.
`
  })
  @ApiResponse({
    status: 200,
    description: "병합이 완료됨. 응답에 충돌 정보 포함됨 (hasConflict, conflictFiles)",
    type: MergeResponse,
  })
  @Post(":repoId/merge")
  @HttpCode(HttpStatus.OK)
  async mergeBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() mergeBranchDto: MergeBranchDto,
  ): Promise<MergeResponse> {
    return this.branchService.mergeBranch(
      repoId,
      user.id,
      mergeBranchDto.sourceBranch,
      mergeBranchDto.targetBranch,
      mergeBranchDto.fastForwardOnly || false,
    );
  }

  @ApiTags("Pull Requests")
  @ApiOperation({ summary: "Pull Request 생성" })
  @ApiResponse({
    status: 201,
    description: "Pull Request가 성공적으로 생성됨",
    type: PullRequest,
  })
  @Post(":repoId/pull-requests")
  @HttpCode(HttpStatus.CREATED)
  async createPullRequest(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() createPullRequestDto: CreatePullRequestDto,
  ) {
    return this.pullRequestService.createPullRequest(
      repoId,
      user.id,
      createPullRequestDto,
    );
  }

  @ApiTags("Pull Requests")
  @ApiOperation({ summary: "Pull Request 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "Pull Request 목록 반환",
    type: [PullRequest],
  })
  @Get(":repoId/pull-requests")
  @HttpCode(HttpStatus.OK)
  async getPullRequests(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("status") status?: PullRequestStatus,
  ) {
    return this.pullRequestService.getPullRequests(repoId, user.id, status);
  }

  @ApiTags("Pull Requests")
  @ApiOperation({ summary: "Pull Request 상세 조회" })
  @ApiResponse({
    status: 200,
    description: "Pull Request 상세 정보 반환",
    type: PullRequest,
  })
  @Get(":repoId/pull-requests/:prId")
  @HttpCode(HttpStatus.OK)
  async getPullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.pullRequestService.getPullRequest(repoId, user.id, prId);
  }

  @ApiTags("Pull Requests")
  @ApiOperation({ summary: "Pull Request 병합" })
  @ApiResponse({
    status: 200,
    description: "Pull Request가 성공적으로 병합됨",
    type: PullRequest,
  })
  @Post(":repoId/pull-requests/:prId/merge")
  @HttpCode(HttpStatus.OK)
  async mergePullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Body() mergePullRequestDto?: MergePullRequestDto,
  ) {
    return this.pullRequestService.mergePullRequest(
      repoId,
      user.id,
      prId,
      mergePullRequestDto?.fastForwardOnly || false,
    );
  }

  @ApiTags("Pull Requests")
  @ApiOperation({ summary: "Pull Request 닫기" })
  @ApiResponse({
    status: 200,
    description: "Pull Request가 성공적으로 닫힘",
    type: PullRequest,
  })
  @Post(":repoId/pull-requests/:prId/close")
  @HttpCode(HttpStatus.OK)
  async closePullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.pullRequestService.closePullRequest(repoId, user.id, prId);
  }

  @ApiTags("Pull Requests")
  @ApiOperation({ summary: "Pull Request 리뷰 작성" })
  @ApiResponse({
    status: 201,
    description: "리뷰가 성공적으로 작성됨",
    type: PrReview,
  })
  @Post(":repoId/pull-requests/:prId/reviews")
  @HttpCode(HttpStatus.CREATED)
  async createReview(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Body() createReviewDto: CreateReviewDto,
  ) {
    return this.pullRequestService.createReview(
      repoId,
      user.id,
      prId,
      createReviewDto,
    );
  }

  @ApiTags("Pull Requests")
  @ApiOperation({ summary: "Pull Request 리뷰 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "리뷰 목록 반환",
    type: [PrReview],
  })
  @Get(":repoId/pull-requests/:prId/reviews")
  @HttpCode(HttpStatus.OK)
  async getReviews(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.pullRequestService.getReviews(repoId, user.id, prId);
  }

  // 파일 관리 API들
  @ApiTags("Files")
  @ApiOperation({ summary: "파일 브라우징 및 파일 내용 조회" })
  @ApiResponse({
    status: 200,
    description: "파일/폴더 목록 또는 파일 내용 반환",
  })
  @Get(":repoId/files")
  @HttpCode(HttpStatus.OK)
  async browseFiles(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("path") filePath?: string,
  ) {
    return this.fileService.browseFiles(repoId, user.id, filePath);
  }

  @ApiTags("Files")
  @ApiOperation({
    summary: "파일 생성 또는 업로드",
    description: `Content-Type에 따라 다르게 동작합니다.

**방법 1: 텍스트 파일 생성 (application/json)**
\`\`\`json
POST /repos/:repoId/files
Content-Type: application/json

{
  "filename": "README.md",
  "content": "# Hello World",
  "path": "docs",
  "overwrite": false
}
\`\`\`

**방법 2: 파일 업로드 (multipart/form-data)**

📤 **단일 파일 업로드**
\`\`\`bash
curl -X POST "http://localhost:6101/repos/:repoId/files" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "files=@/path/to/image.png" \\
  -F "path=uploads" \\
  -F "overwrite=false"
\`\`\`

📤 **여러 파일 동시 업로드 (최대 10개)**
\`\`\`bash
curl -X POST "http://localhost:6101/repos/:repoId/files" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "files=@/path/to/file1.png" \\
  -F "files=@/path/to/file2.pdf" \\
  -F "files=@/path/to/file3.zip" \\
  -F "path=uploads" \\
  -F "overwrite=false"
\`\`\`

📮 **Postman에서 사용법:**
1. Body 탭 선택
2. form-data 선택
3. Key: "files", Type: File 선택 후 파일 선택
4. 여러 파일: 같은 Key "files"로 여러 행 추가
5. Key: "path" (선택), Value: "uploads"
6. Key: "overwrite" (선택), Value: "false"

🌐 **JavaScript (Fetch API)**
\`\`\`javascript
const formData = new FormData();
formData.append('files', file1);
formData.append('files', file2);  // 같은 키로 여러 개 추가
formData.append('files', file3);
formData.append('path', 'uploads');
formData.append('overwrite', 'false');

fetch('/repos/:repoId/files', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
  body: formData
});
\`\`\`

**제한:**
- 최대 10개 파일 동시 업로드
- 각 파일 최대 10MB
- 모든 파일 형식 지원 (이미지, PDF, ZIP 등)
`
  })
  @ApiResponse({
    status: 201,
    description: "파일이 성공적으로 생성/업로드됨",
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        uploadedFiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string', example: 'image.png' },
              path: { type: 'string', example: 'uploads/image.png' },
              size: { type: 'number', example: 1024000 },
              mimetype: { type: 'string', example: 'image/png' }
            }
          }
        }
      }
    }
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: 'object',
          title: 'JSON - 텍스트 파일 생성',
          properties: {
            filename: { type: 'string', example: 'test.txt', description: '생성할 파일명' },
            content: { type: 'string', example: 'Hello World', description: '파일 내용' },
            path: { type: 'string', example: 'src', description: '파일 경로 (선택사항)' },
            overwrite: { type: 'boolean', example: false, description: '덮어쓰기 허용 여부' },
          },
          required: ['filename', 'content'],
        },
        {
          type: 'object',
          title: 'Multipart - 파일 업로드',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
              description: '업로드할 파일들 (최대 10개, 각 10MB 제한)',
            },
            path: { type: 'string', example: 'uploads', description: '업로드 경로 (선택사항)' },
            overwrite: { type: 'boolean', example: false, description: '덮어쓰기 허용 여부' },
          },
          required: ['files'],
        },
      ],
    },
  })
  @Post(":repoId/files")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('files', 10, {
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB 제한
  }))
  async createOrUploadFile(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @UploadedFiles() files?: Express.Multer.File[],
    @Body() body?: any,
  ) {
    if (files && files.length > 0) {
      const uploadPath = body?.path || "";
      const overwrite = body?.overwrite !== undefined
        ? (Boolean(body?.overwrite) || String(body?.overwrite) === 'true')
        : true; // 기본값을 true로 변경

      return this.fileService.uploadFiles(
        repoId,
        user.id,
        files,
        uploadPath,
        overwrite,
      );
    }

    // application/json으로 텍스트 파일 생성
    const createFileDto = body as CreateFileDto;
    return this.fileService.createFile(
      repoId,
      user.id,
      createFileDto.filename,
      createFileDto.content,
      createFileDto.path,
      createFileDto.overwrite,
    );
  }

  @ApiTags("Files")
  @ApiOperation({ summary: "파일 내용 수정" })
  @ApiResponse({ status: 200, description: "파일이 성공적으로 수정됨" })
  @Patch(":repoId/files")
  @HttpCode(HttpStatus.OK)
  async updateFile(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() updateFileDto: UpdateFileDto,
  ) {
    return this.fileService.updateFile(
      repoId,
      user.id,
      updateFileDto.path,
      updateFileDto.content,
    );
  }

  @ApiTags("Files")
  @ApiOperation({ summary: "파일 또는 폴더 삭제" })
  @ApiResponse({ status: 200, description: "파일/폴더가 성공적으로 삭제됨" })
  @Delete(":repoId/files")
  @HttpCode(HttpStatus.OK)
  async deleteFile(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("path") filePath: string,
  ) {
    return this.fileService.deleteFile(repoId, user.id, filePath);
  }

  // Git 충돌 관련 API들
  @ApiTags("Conflicts")
  @ApiOperation({
    summary: "충돌 파일 목록 조회",
    description: "현재 레포지토리의 충돌 상태와 충돌 파일 목록을 반환합니다."
  })
  @ApiResponse({
    status: 200,
    description: "충돌 정보 반환",
    schema: {
      type: 'object',
      properties: {
        hasConflict: { type: 'boolean', example: true },
        conflictFiles: {
          type: 'array',
          items: { type: 'string' },
          example: ['README.md', 'src/index.ts']
        },
        message: { type: 'string', example: '2개 파일에서 충돌이 발생했습니다' }
      }
    }
  })
  @Get(":repoId/conflicts")
  @HttpCode(HttpStatus.OK)
  async getConflicts(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
  ) {
    return this.gitConflictService.checkForConflicts(repoId, user.id);
  }

  @ApiTags("Conflicts")
  @ApiOperation({
    summary: "충돌 해결",
    description: `충돌이 발생한 파일을 해결합니다.

**해결 방법:**
- \`ours\`: 현재 브랜치의 버전을 선택
- \`theirs\`: 병합 대상 브랜치의 버전을 선택
- \`manual\`: 수동으로 수정한 내용을 적용

**요청 예시:**
\`\`\`json
{
  "filePath": "README.md",
  "resolution": "ours"
}
\`\`\`

**수동 해결 예시:**
\`\`\`json
{
  "filePath": "README.md",
  "resolution": "manual",
  "manualContent": "# 수정된 내용\\n..."
}
\`\`\``
  })
  @ApiResponse({
    status: 200,
    description: "충돌이 성공적으로 해결됨",
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: '파일 충돌이 해결되었습니다' }
      }
    }
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', example: 'README.md', description: '충돌 파일 경로' },
        resolution: {
          type: 'string',
          enum: ['ours', 'theirs', 'manual'],
          description: '해결 방법'
        },
        manualContent: {
          type: 'string',
          description: 'resolution이 manual일 때 필요한 파일 내용'
        }
      },
      required: ['filePath', 'resolution']
    }
  })
  @Post(":repoId/conflicts/resolve")
  @HttpCode(HttpStatus.OK)
  async resolveConflict(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: {
      filePath: string;
      resolution: "ours" | "theirs" | "manual";
      manualContent?: string;
    },
  ) {
    return this.gitConflictService.resolveConflict(
      repoId,
      user.id,
      body.filePath,
      body.resolution,
      body.manualContent,
    );
  }

  @ApiTags("Conflicts")
  @ApiOperation({
    summary: "병합 중단",
    description: "진행 중인 병합을 취소하고 이전 상태로 되돌립니다."
  })
  @ApiResponse({
    status: 200,
    description: "병합이 성공적으로 취소됨",
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: '병합이 취소되었습니다' }
      }
    }
  })
  @Post(":repoId/merge/abort")
  @HttpCode(HttpStatus.OK)
  async abortMerge(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
  ) {
    return this.gitConflictService.abortMerge(repoId, user.id);
  }

  @ApiTags("Conflicts")
  @ApiOperation({
    summary: "AI 충돌 해결 제안",
    description: `Claude AI가 충돌 파일을 분석하고 최적의 병합 제안을 제공합니다.

**사용 방법:**
1. 충돌이 발생한 파일의 경로를 전달
2. AI가 양쪽 버전을 분석하고 병합 코드 생성
3. 제안된 코드와 설명을 검토
4. 마음에 들면 \`/conflicts/resolve\` API로 적용

**요청 예시:**
\`\`\`json
{
  "filePath": "src/index.ts"
}
\`\`\`

**응답 예시:**
\`\`\`json
{
  "success": true,
  "suggestion": "병합된 코드 (충돌 마커 제거됨)",
  "explanation": "두 버전의 기능을 모두 유지하면서...",
  "confidence": 0.92
}
\`\`\`

**참고:** CLAUDE_API_KEY 환경변수가 설정되어 있어야 합니다.`
  })
  @ApiResponse({
    status: 200,
    description: "AI 제안이 성공적으로 생성됨",
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        suggestion: {
          type: 'string',
          description: '충돌이 해결된 코드 (마커 제거됨)',
          example: 'function hello() {\n  console.log("Hello");\n  return "greeting";\n}'
        },
        explanation: {
          type: 'string',
          description: 'AI가 선택한 이유 설명',
          example: '두 브랜치의 console.log와 return문을 모두 유지했습니다...'
        },
        confidence: {
          type: 'number',
          description: '신뢰도 (0-1)',
          example: 0.92
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: "충돌 마커가 없거나 파일을 찾을 수 없음"
  })
  @ApiResponse({
    status: 500,
    description: "AI 서비스 오류"
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          example: 'README.md',
          description: '충돌이 발생한 파일 경로'
        }
      },
      required: ['filePath']
    }
  })
  @Post(":repoId/conflicts/ai-suggest")
  @HttpCode(HttpStatus.OK)
  async aiSuggestConflictResolution(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: { filePath: string }
  ) {
    // 1. 충돌 파일 내용 읽기
    const fileContent = await this.fileService.browseFiles(
      repoId,
      user.id,
      body.filePath
    );

    // browseFiles의 반환 타입에 따라 처리
    const conflictContent = typeof fileContent === 'string'
      ? fileContent
      : (fileContent as any).content || JSON.stringify(fileContent);

    // 2. 충돌 마커 확인
    if (!conflictContent.includes('<<<<<<< HEAD')) {
      throw new HttpException(
        '이 파일에는 충돌 마커가 없습니다',
        HttpStatus.BAD_REQUEST
      );
    }

    // 3. AI에게 해결 제안 요청
    const result = await this.aiConflictResolver.suggestResolution(
      conflictContent,
      body.filePath
    );

    return {
      success: true,
      suggestion: result.resolvedCode,
      explanation: result.explanation,
      confidence: result.confidence
    };
  }

  // Diff 관련 API들
  @ApiTags("Diffs")
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

  @ApiTags("Diffs")
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

  @ApiTags("Diffs")
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

  @ApiTags("Diffs")
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

  @ApiTags("Diffs")
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

  @ApiTags("Diffs")
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

  @ApiTags("Diffs")
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

  @ApiTags("Pull Requests")
  @ApiOperation({
    summary: "Pull Request의 변경사항 diff",
    description: "PR의 source와 target 브랜치 간 diff를 조회합니다"
  })
  @ApiResponse({
    status: 200,
    description: "PR diff 정보"
  })
  @Get(":repoId/pull-requests/:prId/diff")
  @HttpCode(HttpStatus.OK)
  async getPullRequestDiff(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Query("path") filePath?: string,
  ) {
    // PR 정보 조회
    const pr = await this.pullRequestService.getPullRequest(repoId, user.id, prId);

    // source와 target 브랜치 간 diff
    return this.gitDiffService.getBranchDiff(
      repoId,
      user.id,
      pr.sourceBranch,
      pr.targetBranch,
      filePath
    );
  }

}
