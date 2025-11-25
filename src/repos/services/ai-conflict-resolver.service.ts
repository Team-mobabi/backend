import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";

export interface AIResolutionResult {
  resolvedCode: string;
  explanation: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  requiresReview: boolean;
}

export enum ConfidenceLevel {
  VERY_HIGH = "VERY_HIGH",     // 90-100: 자동 적용 가능
  HIGH = "HIGH",               // 70-89: 검토 후 적용 권장
  MEDIUM = "MEDIUM",           // 50-69: 수동 검토 필요
  LOW = "LOW",                 // 30-49: 주의 필요
  VERY_LOW = "VERY_LOW",       // 0-29: 수동 해결 강력 권장
}

export interface ConflictContext {
  ourBranch?: string;
  theirBranch?: string;
  ourCommitMessage?: string;
  theirCommitMessage?: string;
  fileHistory?: string[];
}

@Injectable()
export class AIConflictResolverService {
  private readonly logger = new Logger(AIConflictResolverService.name);
  private anthropic: Anthropic;
  private readonly MAX_RETRIES = 3;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("CLAUDE_API_KEY");

    if (!apiKey) {
      this.logger.warn("CLAUDE_API_KEY is not configured. AI conflict resolution will not be available.");
      
    } else {
      this.anthropic = new Anthropic({
        apiKey,
      });
    }
  }

  /**
   * AI를 사용하여 Git 충돌 해결 제안을 생성합니다 (재시도 로직 포함)
   */
  async suggestResolution(
    conflictContent: string,
    filePath: string,
    context?: ConflictContext,
  ): Promise<AIResolutionResult> {
    if (!this.anthropic) {
      throw new Error("AI conflict resolution is not available. CLAUDE_API_KEY is not configured.");
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        this.logger.log(`충돌 해결 시도 ${attempt}/${this.MAX_RETRIES}: ${filePath}`);

        const result = await this.callAI(conflictContent, filePath, context);

        // 신뢰도가 너무 낮으면 재시도 (마지막 시도가 아닌 경우)
        if (result.confidence < 0.5 && attempt < this.MAX_RETRIES) {
          this.logger.warn(`낮은 신뢰도 (${result.confidence * 100}%), 재시도...`);
          continue;
        }

        return result;
      } catch (error) {
        lastError = error;
        this.logger.error(`시도 ${attempt} 실패: ${error.message}`);

        if (attempt < this.MAX_RETRIES) {
          await this.delay(1000 * attempt); // 점진적 대기
        }
      }
    }

    throw new Error(`AI conflict resolution failed after ${this.MAX_RETRIES} attempts: ${lastError?.message}`);
  }

  /**
   * AI API 호출
   */
  private async callAI(
    conflictContent: string,
    filePath: string,
    context?: ConflictContext,
  ): Promise<AIResolutionResult> {
    const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
    const language = this.getLanguage(fileExtension);
    const prompt = this.buildPrompt(conflictContent, filePath, fileExtension, language, context);

    const message = await this.anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      temperature: 0.1, // 더 낮은 온도로 일관성 향상
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const firstContent = message.content[0];
    const responseText = firstContent.type === 'text' ? firstContent.text : '';
    return this.parseResponse(responseText, conflictContent);
  }

  /**
   * 파일 확장자로 언어 판별
   */
  private getLanguage(fileExtension: string): string {
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
    return languageMap[fileExtension] || 'Unknown';
  }

  /**
   * 개선된 프롬프트 생성 (Few-shot 예시 + 명확한 신뢰도 기준 포함)
   */
  private buildPrompt(
    conflictContent: string,
    filePath: string,
    fileExtension: string,
    language: string,
    context?: ConflictContext,
  ): string {
    // 컨텍스트 정보 구성
    const contextInfo = context ? `
**Branch Context:**
- Our Branch (HEAD): ${context.ourBranch || 'unknown'}
- Their Branch (merging): ${context.theirBranch || 'unknown'}
- Our Commit Message: "${context.ourCommitMessage || 'N/A'}"
- Their Commit Message: "${context.theirCommitMessage || 'N/A'}"
` : '';

    return `You are an expert Git merge conflict resolver. Your task is to analyze merge conflicts and provide the optimal resolution.

**File Information:**
- Path: ${filePath}
- Language: ${language}
- Extension: .${fileExtension}
${contextInfo}

---

## Few-Shot Examples (학습 참고용)

### Example 1: Simple Value Conflict (High Confidence)
**Input:**
\`\`\`js
<<<<<<< HEAD
const API_TIMEOUT = 5000;
=======
const API_TIMEOUT = 10000;
>>>>>>> feature/improve-timeout
\`\`\`

**Good Resolution:**
MERGED_CODE:
\`\`\`js
const API_TIMEOUT = 10000;
\`\`\`
EXPLANATION: 타임아웃 값 충돌입니다. feature 브랜치에서 10초로 증가시킨 것은 안정성 향상을 위한 의도적 변경으로 보입니다. 더 긴 타임아웃을 선택했습니다.
CONFIDENCE: 95

---

### Example 2: Function Addition Conflict (Medium Confidence)
**Input:**
\`\`\`js
<<<<<<< HEAD
function processData(data) {
  return data.map(item => item.value);
}
=======
function processData(data) {
  return data.filter(item => item.active).map(item => item.value);
}
>>>>>>> feature/filter-active
\`\`\`

**Good Resolution:**
MERGED_CODE:
\`\`\`js
function processData(data) {
  return data.filter(item => item.active).map(item => item.value);
}
\`\`\`
EXPLANATION: 데이터 처리 로직 충돌입니다. feature 브랜치에서 active 필터링을 추가했습니다. 이는 기존 기능을 확장한 것이므로 새 버전을 선택했습니다. 단, 기존 코드가 모든 데이터를 처리해야 하는 경우가 있다면 검토가 필요합니다.
CONFIDENCE: 75

---

### Example 3: Bad Resolution (하면 안되는 것!)
**Input:**
\`\`\`js
<<<<<<< HEAD
const config = { debug: true };
=======
const config = { debug: false };
>>>>>>> production
\`\`\`

**BAD Resolution (❌ 절대 이렇게 하지 마세요):**
\`\`\`js
const config = { debug: true };
const config = { debug: false };  // 중복 선언 - 문법 오류!
\`\`\`

**GOOD Resolution (✅):**
\`\`\`js
const config = { debug: false };  // production 설정 우선
\`\`\`

---

## Confidence Score Guidelines (신뢰도 평가 기준)

| Score | Level | Description | Action |
|-------|-------|-------------|--------|
| 90-100 | VERY_HIGH | 단순 값 변경, 명확한 한쪽 선택 | 자동 적용 가능 |
| 70-89 | HIGH | 로직 변경이 있지만 의도가 명확함 | 검토 후 적용 권장 |
| 50-69 | MEDIUM | 양쪽 의도가 다르지만 병합 가능 | 수동 검토 필요 |
| 30-49 | LOW | 복잡한 로직 충돌, 의미 파악 어려움 | 주의 필요, 개발자 확인 권장 |
| 0-29 | VERY_LOW | 의미적 충돌, 비즈니스 로직 결정 필요 | 수동 해결 강력 권장 |

---

## Your Task

**Conflict Content to Resolve:**
\`\`\`${fileExtension}
${conflictContent}
\`\`\`

---

## Response Format (MUST follow EXACTLY)

MERGED_CODE:
\`\`\`${fileExtension}
[완전히 해결된 코드 - 충돌 마커 없이]
\`\`\`

EXPLANATION:
[한국어로 설명:
- 충돌 원인: 어떤 변경사항들이 충돌했는지
- 선택 근거: 각 버전에서 무엇을 선택/병합했고 왜 그렇게 했는지
- 주의사항: 검토가 필요한 부분이 있다면 명시
- Best Practice: ${language} 관련 적용 내용]

CONFIDENCE: [0-100 숫자만]

---

## Critical Requirements
1. ❌ 충돌 마커(<<<<<<, =======, >>>>>>>)가 남아있으면 안됨
2. ❌ 문법 오류가 있으면 안됨 (중복 선언, 괄호 불일치 등)
3. ✅ 양쪽의 의도를 최대한 보존
4. ✅ ${language} 문법과 컨벤션 준수
5. ✅ 코드가 실행 가능한 상태여야 함`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * AI 응답을 파싱하여 구조화된 결과로 변환합니다
   */
  private parseResponse(text: string, originalConflict: string): AIResolutionResult {
    // 코드 블록 추출
    const codeMatch = text.match(
      /MERGED_CODE:\s*```\w*\n([\s\S]*?)\n```/,
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
    const confidenceRaw = parseInt(confidenceMatch?.[1] || "50");
    const confidence = confidenceRaw / 100;

    if (!resolvedCode) {
      throw new Error("AI가 유효한 해결 코드를 생성하지 못했습니다");
    }

    if (
      resolvedCode.includes("<<<<<<<") ||
      resolvedCode.includes(">>>>>>>") ||
      resolvedCode.includes("=======")
    ) {
      throw new Error(
        "AI가 생성한 코드에 여전히 충돌 마커가 포함되어 있습니다",
      );
    }

    // 추가 검증: 원본 코드의 핵심 요소가 보존되었는지 확인
    this.validateCodePreservation(resolvedCode, originalConflict);

    // 신뢰도 레벨 및 검토 필요 여부 결정
    const confidenceLevel = this.getConfidenceLevel(confidenceRaw);
    const requiresReview = confidenceRaw < 70;

    return {
      resolvedCode,
      explanation,
      confidence,
      confidenceLevel,
      requiresReview,
    };
  }

  /**
   * 신뢰도 점수를 레벨로 변환
   */
  private getConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 90) return ConfidenceLevel.VERY_HIGH;
    if (score >= 70) return ConfidenceLevel.HIGH;
    if (score >= 50) return ConfidenceLevel.MEDIUM;
    if (score >= 30) return ConfidenceLevel.LOW;
    return ConfidenceLevel.VERY_LOW;
  }

  /**
   * 원본 코드의 핵심 식별자가 보존되었는지 검증
   */
  private validateCodePreservation(resolvedCode: string, originalConflict: string): void {
    // 충돌 마커 제거하고 양쪽 코드에서 식별자 추출
    const cleanOriginal = originalConflict
      .replace(/<<<<<<< .*/g, '')
      .replace(/=======/g, '')
      .replace(/>>>>>>> .*/g, '');

    // 함수명, 변수명 등 핵심 식별자 패턴
    const identifierPattern = /(?:function|const|let|var|class|interface|type)\s+(\w+)/g;
    const originalIdentifiers = new Set<string>();
    let match;

    while ((match = identifierPattern.exec(cleanOriginal)) !== null) {
      originalIdentifiers.add(match[1]);
    }

    // 해결된 코드에서 핵심 식별자가 누락되었는지 확인 (경고만, 에러는 아님)
    const missingIdentifiers: string[] = [];
    originalIdentifiers.forEach(id => {
      if (!resolvedCode.includes(id)) {
        missingIdentifiers.push(id);
      }
    });

    if (missingIdentifiers.length > 0) {
      this.logger.warn(`일부 식별자가 해결된 코드에서 누락됨: ${missingIdentifiers.join(', ')}`);
    }
  }

  /**
   * API 키가 올바르게 설정되어 있는지 확인합니다
   */
  isConfigured(): boolean {
    return !!this.configService.get<string>("CLAUDE_API_KEY");
  }
}
