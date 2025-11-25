import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";

export interface GitContext {
  currentBranch?: string;
  branches?: string[];
  hasUncommittedChanges?: boolean;
  hasConflicts?: boolean;
  recentCommits?: Array<{
    hash: string;
    message: string;
    author: string;
  }>;
  stagingArea?: string[];
  workingDirectory?: string[];
}

export interface AIAssistantResponse {
  answer: string;
  suggestedActions?: string[];
  relatedConcepts?: string[];
}

@Injectable()
export class AIAssistantService {
  private anthropic: Anthropic;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("CLAUDE_API_KEY");

    if (!apiKey) {
      console.warn("CLAUDE_API_KEY is not configured. AI assistant will not be available.");
    } else {
      this.anthropic = new Anthropic({
        apiKey,
      });
    }
  }

  async answerQuestion(
    question: string,
    gitContext?: GitContext,
  ): Promise<AIAssistantResponse> {
    if (!this.anthropic) {
      throw new Error("AI assistant is not available. CLAUDE_API_KEY is not configured.");
    }

    try {
      const contextString = this.formatGitContext(gitContext);

      const message = await this.anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2048,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: `당신은 Git 초보자를 돕는 친절한 멘토입니다. 복잡한 용어 대신 쉬운 말로 설명하고, 구체적인 행동 지침을 제공하세요.

**사용자의 현재 Git 상태:**
${contextString}

**사용자의 질문:**
"${question}"

**답변 가이드라인:**
1. **초보자 관점**: 전문 용어를 피하고, 비유나 예시를 사용하세요
2. **단계별 설명**: 복잡한 작업은 순서대로 나눠서 설명하세요
3. **실용적 조언**: 이론보다는 "지금 무엇을 해야 하는지" 중심으로 답변하세요
4. **안전성 강조**: 데이터 손실 위험이 있는 작업은 경고하세요
5. **격려와 공감**: 초보자가 실수하는 것은 자연스럽다는 것을 알려주세요

**응답 형식** (반드시 이 형식을 따르세요):

ANSWER:
[질문에 대한 친절하고 상세한 답변을 한국어로 작성하세요.
- 질문의 핵심 개념 설명
- 왜 이것이 중요한지
- 어떻게 해결하거나 수행하는지
- 주의사항이나 팁]

SUGGESTED_ACTIONS:
- [구체적인 행동 1 - 예: "브랜치 목록 확인하기"]
- [구체적인 행동 2 - 예: "변경사항 커밋하기"]
- [구체적인 행동 3 - 최대 5개까지]

RELATED_CONCEPTS:
- [관련 개념 1 - 예: "브랜치"]
- [관련 개념 2 - 예: "병합"]
- [관련 개념 3 - 최대 5개까지]

**예시:**
질문: "커밋이 뭔가요?"

ANSWER:
커밋(commit)은 여러분의 작업을 저장소에 "저장"하는 것입니다.
마치 게임에서 세이브 포인트를 만드는 것과 비슷해요.

커밋을 하면:
1. 현재 파일들의 상태가 기록됩니다
2. 나중에 이 시점으로 되돌릴 수 있습니다
3. 다른 사람들과 작업 내용을 공유할 수 있습니다

커밋을 할 때는 "무엇을 왜 바꿨는지" 메시지를 함께 남기는 것이 좋아요.
예를 들어 "로그인 버튼 색상 변경" 같은 식으로요.

SUGGESTED_ACTIONS:
- 변경한 파일을 스테이징 영역에 추가하기
- 커밋 메시지 작성하기
- 커밋 실행하기
- 커밋 내역 확인하기

RELATED_CONCEPTS:
- 스테이징 영역
- 커밋 메시지
- 커밋 히스토리
- Push (원격 저장소로 보내기)`,
          },
        ],
      });

      const firstContent = message.content[0];
      const responseText = firstContent.type === "text" ? firstContent.text : "";
      return this.parseResponse(responseText);
    } catch (error) {
      throw new Error(`AI assistant failed: ${error.message}`);
    }
  }

  async suggestNextAction(gitContext: GitContext): Promise<AIAssistantResponse> {
    if (!this.anthropic) {
      throw new Error("AI assistant is not available. CLAUDE_API_KEY is not configured.");
    }

    try {
      const contextString = this.formatGitContext(gitContext);

      const message = await this.anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1536,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: `당신은 Git 초보자의 다음 작업을 제안하는 멘토입니다.

**현재 Git 상태:**
${contextString}

**임무:**
현재 상태를 분석하고, 사용자가 다음에 무엇을 해야 할지 제안하세요.

**고려 사항:**
- 미커밋 변경사항이 있다면 커밋을 권장
- 충돌이 있다면 해결을 우선 제안
- 작업이 완료되었다면 Push나 PR 생성 제안
- 초보자가 이해하기 쉽게 설명

**응답 형식:**

ANSWER:
[현재 상태에 대한 요약과 다음 할 일에 대한 친절한 설명]

SUGGESTED_ACTIONS:
- [우선순위가 높은 작업부터 순서대로]
- [각 작업은 구체적이고 실행 가능해야 함]

RELATED_CONCEPTS:
- [관련된 Git 개념들]`,
          },
        ],
      });

      const firstContent = message.content[0];
      const responseText = firstContent.type === "text" ? firstContent.text : "";
      return this.parseResponse(responseText);
    } catch (error) {
      throw new Error(`AI assistant failed: ${error.message}`);
    }
  }

  private formatGitContext(context?: GitContext): string {
    if (!context) {
      return "상태 정보 없음";
    }

    const parts: string[] = [];

    if (context.currentBranch) {
      parts.push(`- 현재 브랜치: ${context.currentBranch}`);
    }

    if (context.branches && context.branches.length > 0) {
      parts.push(`- 전체 브랜치: ${context.branches.join(", ")}`);
    }

    if (context.hasConflicts) {
      parts.push(`- ⚠️ 충돌 발생 중`);
    }

    if (context.hasUncommittedChanges) {
      parts.push(`- 커밋되지 않은 변경사항 있음`);
    }

    if (context.stagingArea && context.stagingArea.length > 0) {
      parts.push(
        `- 스테이징된 파일 (${context.stagingArea.length}개): ${context.stagingArea.join(", ")}`,
      );
    }

    if (context.workingDirectory && context.workingDirectory.length > 0) {
      parts.push(
        `- 수정된 파일 (${context.workingDirectory.length}개): ${context.workingDirectory.join(", ")}`,
      );
    }

    if (context.recentCommits && context.recentCommits.length > 0) {
      parts.push(`- 최근 커밋:`);
      context.recentCommits.slice(0, 3).forEach((commit) => {
        parts.push(`  * ${commit.hash.substring(0, 7)}: ${commit.message}`);
      });
    }

    return parts.length > 0 ? parts.join("\n") : "상태 정보 없음";
  }

  private parseResponse(text: string): AIAssistantResponse {
    const answerMatch = text.match(
      /ANSWER:\s*([\s\S]*?)(?:\n\nSUGGESTED_ACTIONS:|\nSUGGESTED_ACTIONS:|$)/,
    );

    const actionsMatch = text.match(
      /SUGGESTED_ACTIONS:\s*([\s\S]*?)(?:\n\nRELATED_CONCEPTS:|\nRELATED_CONCEPTS:|$)/,
    );

    const conceptsMatch = text.match(/RELATED_CONCEPTS:\s*([\s\S]*?)$/);

    const answer =
      answerMatch?.[1]?.trim() ||
      "죄송합니다. 답변을 생성하는 데 문제가 있었습니다. 다시 시도해주세요.";

    const parseList = (listText: string): string[] => {
      if (!listText) return [];
      return listText
        .split("\n")
        .filter((line) => line.trim().startsWith("-"))
        .map((line) => line.trim().substring(1).trim())
        .filter((item) => item.length > 0);
    };

    const suggestedActions = parseList(actionsMatch?.[1] || "");
    const relatedConcepts = parseList(conceptsMatch?.[1] || "");

    return {
      answer,
      suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
      relatedConcepts: relatedConcepts.length > 0 ? relatedConcepts : undefined,
    };
  }

  isConfigured(): boolean {
    return !!this.configService.get<string>("CLAUDE_API_KEY");
  }
}