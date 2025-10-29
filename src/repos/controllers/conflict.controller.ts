import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
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
  ApiBody,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@src/auth/guards/jwt-auth.guard";
import { GitConflictService } from "@src/repos/services/git-conflict.service";
import { AIConflictResolverService } from "@src/repos/services/ai-conflict-resolver.service";
import { FileService } from "@src/repos/services/file.service";
import { User } from "@src/users/entities/user.entity";
import { AuthUser } from "@src/repos/auth-user.decorator";

@ApiTags("Conflicts")
@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class ConflictController {
  constructor(
    private readonly gitConflictService: GitConflictService,
    private readonly aiConflictResolver: AIConflictResolverService,
    private readonly fileService: FileService,
  ) {}

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
}