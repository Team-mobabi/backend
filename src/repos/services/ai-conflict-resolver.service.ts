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
      const message = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4096,
        temperature: 0.2, // 낮은 온도 = 더 일관적이고 예측 가능한 출력
        messages: [
          {
            role: "user",
            content: `You are an expert Git conflict resolver.

File: ${filePath}

This file has Git merge conflict markers. Analyze both versions and provide the best resolution.

Conflict content:
\`\`\`
${conflictContent}
\`\`\`

Provide your response in this EXACT format:

MERGED_CODE:
\`\`\`
[put the resolved code here without any conflict markers]
\`\`\`

EXPLANATION:
[explain in Korean why you chose this resolution - what from each version you kept or merged and why]

CONFIDENCE: [a number from 0 to 100 representing your confidence in this resolution]

Important:
- Remove ALL conflict markers (<<<<<<, =======, >>>>>>>)
- Preserve code functionality from both versions when possible
- Keep the code style consistent
- If one version is clearly better, use that one
- If both have valuable changes, intelligently merge them`,
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
