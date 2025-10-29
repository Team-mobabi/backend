import {
  Body,
  Controller,
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
import { GitRemoteService } from "@src/repos/services/git-remote/git-remote.service";
import { GitOperationService } from "@src/repos/services/git-operation.service";
import { AddRemoteDto } from "@src/repos/dto/add-remote.dto";
import { PushDto } from "@src/repos/dto/push.dto";
import { PullDto } from "@src/repos/dto/pull.dto";
import { PullResponse } from "@src/repos/dto/responses.dto";
import { CreateLocalRemoteDto } from "@src/repos/dto/create-local-remote.dto";
import { AddDto } from "@src/repos/dto/add.dto";
import { CommitDto } from "@src/repos/dto/commit.dto";
import { ResetDto } from "@src/repos/dto/reset.dto";
import { User } from "@src/users/entities/user.entity";
import { AuthUser } from "@src/repos/auth-user.decorator";

@ApiTags("Git Operations")
@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class GitController {
  constructor(
    private readonly gitRemoteService: GitRemoteService,
    private readonly gitOperationService: GitOperationService,
  ) {}

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
      pushDto.force,
    );
  }

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
}