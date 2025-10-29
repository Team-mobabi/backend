import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { BranchService } from "@src/repos/services/branch/branch.service";
import { MergeResponse } from "@src/repos/dto/responses.dto";
import { CreateBranchDto } from "@src/repos/dto/create-branch.dto";
import { SwitchBranchDto } from "@src/repos/dto/switch-branch.dto";
import { MergeBranchDto } from "@src/repos/dto/merge-branch.dto";
import { User } from "@src/users/entities/user.entity";
import { AuthUser } from "@src/repos/auth-user.decorator";

@ApiTags("Branches")
@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @ApiOperation({ summary: "브랜치 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "브랜치 목록 및 최근 커밋 반환",
    schema: {
      type: 'object',
      properties: {
        branches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'main' },
              pushedCommits: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    hash: { type: 'string', example: 'abc1234' },
                    message: { type: 'string', example: 'Initial commit' },
                    author: { type: 'string', example: '김개발' },
                    committedAt: { type: 'string', example: '2025-10-27T...' }
                  }
                }
              },
              isCurrent: { type: 'boolean', example: false, description: '현재 체크아웃된 브랜치인지' }
            }
          }
        },
        currentBranch: { type: 'string', example: 'main', description: '현재 체크아웃된 브랜치 이름' }
      }
    }
  })
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

  @ApiOperation({ summary: "새 브랜치 생성" })
  @ApiResponse({
    status: 201,
    description: "브랜치가 성공적으로 생성됨",
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: "Branch 'feature' created." },
        branchName: { type: 'string', example: 'feature', description: '생성된 브랜치 이름' },
        currentBranch: { type: 'string', example: 'feature', description: '현재 체크아웃된 브랜치' },
        currentCommit: { type: 'string', example: 'abc1234...', description: '현재 커밋 해시' },
        baseBranch: { type: 'string', example: 'main', nullable: true, description: '기준이 된 브랜치' }
      }
    }
  })
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
    description: "커밋 그래프가 성공적으로 반환됨 (현재 브랜치, 분기점, 전체 커밋 정보 포함)",
    schema: {
      type: 'object',
      properties: {
        currentBranch: { type: 'string', example: 'feature', description: '현재 체크아웃된 브랜치' },
        branchHeads: {
          type: 'object',
          additionalProperties: { type: 'string' },
          example: { main: 'abc1234...', feature: 'def5678...' },
          description: '각 브랜치의 최신 커밋 해시'
        },
        forkPoints: {
          type: 'object',
          additionalProperties: { type: 'string', nullable: true },
          example: { feature: 'abc1234...' },
          description: '각 브랜치가 main에서 갈라진 지점 (공통 조상)'
        },
        commits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              hash: { type: 'string', example: 'abc1234...', description: '커밋 해시' },
              shortHash: { type: 'string', example: 'abc1234', description: '짧은 커밋 해시' },
              parents: {
                type: 'array',
                items: { type: 'string' },
                example: ['parent123...'],
                description: '부모 커밋 해시 배열'
              },
              author: { type: 'string', example: '김개발', description: '작성자' },
              committedAt: { type: 'string', example: '2025-10-27...', description: '커밋 시간' },
              message: { type: 'string', example: 'Initial commit', description: '커밋 메시지' },
              isMerge: { type: 'boolean', example: false, description: '병합 커밋 여부 (parents가 2개 이상)' },
              branches: {
                type: 'array',
                items: { type: 'string' },
                example: ['main', 'feature'],
                description: '이 커밋이 속한 브랜치들'
              },
              isHead: { type: 'string', nullable: true, example: 'main', description: '브랜치 HEAD인 경우 브랜치 이름' }
            }
          },
          description: '전체 커밋 그래프 (브랜치 관계 포함)'
        },
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
}