import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";

export interface AIResolutionResult {
  resolvedCode: string;
  explanation: string;
  confidence: number;
}

@Injectable()
export class AIConflictResolverService {
  private anthropic: Anthropic;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("CLAUDE_API_KEY");

    if (!apiKey) {
      throw new Error("CLAUDE_API_KEY is not configured");
    }

    this.anthropic = new Anthropic({
      apiKey,
    });
  }

  /**
   * AI를 사용하여 Git 충돌 해결 제안을 생성합니다
   */
  async suggestResolution(
    conflictContent: string,
    filePath: string,
  ): Promise<AIResolutionResult> {
    try {
      // 파일 확장자 추출
      const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';

      // 파일 타입별 언어 매핑
      const languageMap: Record<string, string> = {
        'js': 'JavaScript',
        'jsx': 'JavaScript (React)',
        'ts': 'TypeScript',
        'tsx': 'TypeScript (React)',
        'py': 'Python',
        'java': 'Java',
        'cpp': 'C++',
        'c': 'C',
        'go': 'Go',
        'rs': 'Rust',
        'rb': 'Ruby',
        'php': 'PHP',
        'swift': 'Swift',
        'kt': 'Kotlin',
        'cs': 'C#',
        'html': 'HTML',
        'css': 'CSS',
        'scss': 'SCSS',
        'json': 'JSON',
        'yaml': 'YAML',
        'yml': 'YAML',
        'md': 'Markdown',
        'txt': 'Plain Text',
      };

      const language = languageMap[fileExtension] || 'Unknown';

      const message = await this.anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        temperature: 0.2, // 낮은 온도 = 더 일관적이고 예측 가능한 출력
        messages: [
          {
            role: "user",
            content: `You are an expert Git conflict resolver with deep knowledge of software development best practices.

**File Information:**
- Path: ${filePath}
- Language: ${language}
- Extension: .${fileExtension}

**Task:**
This file has Git merge conflict markers. Analyze both versions carefully and provide the best resolution.

**Conflict Content:**
\`\`\`${fileExtension}
${conflictContent}
\`\`\`

**Analysis Guidelines:**
1. **Understand the Context**: Consider what each version is trying to achieve
2. **Preserve Functionality**: Keep all important functionality from both versions
3. **Code Quality**: Maintain consistent style, remove duplicates, ensure best practices
4. **Language-Specific**: Apply ${language}-specific conventions and patterns
5. **Safety First**: If uncertain, prefer the safer option that won't break existing code

**Response Format** (MUST follow this EXACT format):

MERGED_CODE:
\`\`\`${fileExtension}
[put the fully resolved code here with NO conflict markers]
\`\`\`

EXPLANATION:
[Explain in Korean (한국어):
- 어떤 변경사항들이 충돌했는지
- 각 버전에서 무엇을 선택했고 왜 그렇게 했는지
- 병합 시 고려한 주요 사항들
- ${language} 관련 best practice 적용 내용]

CONFIDENCE: [0-100 사이의 숫자. 100 = 매우 확신, 0 = 불확실]

**Critical Requirements:**
- Remove ALL conflict markers (<<<<<<, =======, >>>>>>>)
- Ensure valid ${language} syntax
- Preserve all important functionality
- Maintain code style consistency
- Never leave the code in a broken state`,
          },
        ],
      });

      const firstContent = message.content[0];
      const responseText = firstContent.type === 'text' ? firstContent.text : '';
      return this.parseResponse(responseText);
    } catch (error) {
      throw new Error(`AI conflict resolution failed: ${error.message}`);
    }
  }

  /**
   * AI 응답을 파싱하여 구조화된 결과로 변환합니다
   */
  private parseResponse(text: string): AIResolutionResult {
    // 코드 블록 추출
    const codeMatch = text.match(
      /MERGED_CODE:\s*```[\w]*\n([\s\S]*?)\n```/,
    );

    // 설명 추출
    const explanationMatch = text.match(
      /EXPLANATION:\s*([\s\S]*?)(?:\n\nCONFIDENCE:|\nCONFIDENCE:|$)/,
    );

    // 신뢰도 추출
    const confidenceMatch = text.match(/CONFIDENCE:\s*(\d+)/);

    const resolvedCode = codeMatch?.[1]?.trim() || "";
    const explanation =
      explanationMatch?.[1]?.trim() ||
      "AI가 충돌을 분석하고 해결 방법을 제시했습니다.";
    const confidence = parseInt(confidenceMatch?.[1] || "80") / 100;

    // 코드가 비어있으면 에러
    if (!resolvedCode) {
      throw new Error("AI가 유효한 해결 코드를 생성하지 못했습니다");
    }

    // 충돌 마커가 여전히 남아있는지 확인
    if (
      resolvedCode.includes("<<<<<<<") ||
      resolvedCode.includes(">>>>>>>") ||
      resolvedCode.includes("=======")
    ) {
      throw new Error(
        "AI가 생성한 코드에 여전히 충돌 마커가 포함되어 있습니다",
      );
    }

    return {
      resolvedCode,
      explanation,
      confidence,
    };
  }

  /**
   * API 키가 올바르게 설정되어 있는지 확인합니다
   */
  isConfigured(): boolean {
    return !!this.configService.get<string>("CLAUDE_API_KEY");
  }
}
