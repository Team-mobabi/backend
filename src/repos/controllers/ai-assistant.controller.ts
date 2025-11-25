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
    ApiBody,
} from "@nestjs/swagger";
import {JwtAuthGuard} from "@src/auth/guards/jwt-auth.guard";
import {AIAssistantService, GitContext} from "@src/repos/services/ai-assistant.service";
import {User} from "@src/users/entities/user.entity";
import {AuthUser} from "@src/repos/auth-user.decorator";
import {BaseRepoService} from "@src/repos/services/base-repo.service";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {Repo} from "@src/repos/entities/repo.entity";
import {RepoCollaborator} from "@src/repos/entities/repo-collaborator.entity";
import {ConfigService} from "@nestjs/config";

@ApiTags("AI Assistant")
@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class AIAssistantController extends BaseRepoService {
    constructor(
        @InjectRepository(Repo)
        repoRepository: Repository<Repo>,
        @InjectRepository(RepoCollaborator)
        collaboratorRepository: Repository<RepoCollaborator>,
        configService: ConfigService,
        private readonly aiAssistant: AIAssistantService,
    ) {
        super(repoRepository, collaboratorRepository, configService);
    }

    @ApiOperation({
        summary: "Git 관련 질문에 AI가 답변",
        description: `초보자가 Git 사용 중 궁금한 점을 질문하면 AI가 친절하게 답변합니다.

**사용 예시:**
- "브랜치가 뭔가요?"
- "커밋을 어떻게 취소하나요?"
- "충돌이 발생했는데 어떻게 해결하나요?"
- "지금 무엇을 해야 하나요?"

**특징:**
- 초보자 친화적인 쉬운 설명
- 현재 저장소 상태를 고려한 맞춤형 답변
- 구체적인 행동 지침 제공
- 관련 개념 함께 안내`,
    })
    @ApiResponse({
        status: 200,
        description: "AI 답변 성공",
        schema: {
            type: "object",
            properties: {
                answer: {
                    type: "string",
                    description: "질문에 대한 상세한 답변",
                    example:
                        "브랜치(branch)는 독립적인 작업 공간입니다. 마치 평행 세계처럼, 메인 코드에 영향을 주지 않고 새로운 기능을 개발할 수 있어요...",
                },
                suggestedActions: {
                    type: "array",
                    items: {type: "string"},
                    description: "다음에 할 수 있는 구체적인 행동들",
                    example: [
                        "새 브랜치 만들기",
                        "브랜치 전환하기",
                        "브랜치 병합하기",
                    ],
                },
                relatedConcepts: {
                    type: "array",
                    items: {type: "string"},
                    description: "관련된 Git 개념들",
                    example: ["커밋", "병합", "충돌 해결"],
                },
            },
        },
    })
    @ApiBody({
        schema: {
            type: "object",
            properties: {
                question: {
                    type: "string",
                    example: "브랜치가 뭔가요?",
                    description: "Git에 대한 질문",
                },
            },
            required: ["question"],
        },
    })
    @Post(":repoId/ai/ask")
    @HttpCode(HttpStatus.OK)
    async askQuestion(
        @Param("repoId") repoId: string,
        @AuthUser() user: User,
        @Body() body: { question: string },
    ) {
        const gitContext = await this.getGitContext(repoId, user.id);
        const response = await this.aiAssistant.answerQuestion(
            body.question,

            gitContext,
        );

        return {
            success: true,
            ...response,
        };
    }

    @ApiOperation({
        summary: "다음에 할 일 제안 받기",
        description: `현재 저장소 상태를 분석하여 다음에 무엇을 해야 할지 AI가 제안합니다.

**분석 항목:**
- 커밋되지 않은 변경사항
- 스테이징된 파일
- 충돌 상태
- 현재 브랜치
- 최근 커밋 이력

**제안 예시:**
- "변경사항을 커밋하세요"
- "충돌을 먼저 해결하세요"
- "작업이 완료되었으니 Pull Request를 생성하세요"`,
    })
    @ApiResponse({
        status: 200,
        description: "제안 생성 성공",
        schema: {
            type: "object",
            properties: {
                answer: {
                    type: "string",
                    description: "현재 상태 요약 및 제안",
                    example:
                        "현재 3개 파일이 수정되었지만 아직 커밋되지 않았습니다. 작업 내용을 저장하기 위해 커밋을 하는 것이 좋습니다...",
                },
                suggestedActions: {
                    type: "array",
                    items: {type: "string"},
                    description: "우선순위 순으로 정렬된 할 일",
                    example: [
                        "변경된 파일을 스테이징 영역에 추가하기",
                        "의미있는 커밋 메시지 작성하기",
                        "커밋 실행하기",
                    ],
                },
                relatedConcepts: {
                    type: "array",
                    items: {type: "string"},
                    example: ["커밋", "스테이징", "Push"],
                },
            },
        },
    })
    @Get(":repoId/ai/suggest-next")
    @HttpCode(HttpStatus.OK)
    async suggestNextAction(
        @Param("repoId") repoId: string,
        @AuthUser() user: User,
    ) {
        const gitContext = await this.getGitContext(repoId, user.id);
        const response = await this.aiAssistant.suggestNextAction(gitContext);

        return {
            success: true,
            ...response,
        };
    }

    private async getGitContext(
        repoId: string,
        userId: string,
    ): Promise<GitContext> {
        try {
            const {git} = await this.getRepoAndGit(repoId, userId);

            const status = await git.status();
            const branches = await git.branchLocal();
            const log = await git.log({maxCount: 5});

            return {
                currentBranch: status.current || undefined,
                branches: branches.all,
                hasUncommittedChanges:
                    status.modified.length > 0 ||
                    status.created.length > 0 ||
                    status.deleted.length > 0,
                hasConflicts: status.conflicted.length > 0,
                stagingArea: status.staged,
                workingDirectory: [
                    ...status.modified,
                    ...status.created,
                    ...status.deleted,
                ],
                recentCommits: log.all.map((commit) => ({
                    hash: commit.hash,
                    message: commit.message,
                    author: commit.author_name,
                })),
            };
        } catch (error) {
            return {};
        }
    }
}