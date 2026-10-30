// 프롬프트 원문은 기존 서비스에서 그대로 옮겼다 (평가 결과 재현성을 위해 수정하지 않음)
import type { ConflictContext, GitContext } from "@src/domain/ai/ai";

const LANGUAGES: Record<string, string> = {
  js: "JavaScript",
  jsx: "JavaScript (React)",
  ts: "TypeScript",
  tsx: "TypeScript (React)",
  py: "Python",
  java: "Java",
  cpp: "C++",
  c: "C",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  php: "PHP",
  swift: "Swift",
  kt: "Kotlin",
  cs: "C#",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  md: "Markdown",
  txt: "Plain Text",
};

export const languageOf = (fileExtension: string): string =>
  LANGUAGES[fileExtension] || "Unknown";

export const formatGitContext = (context?: GitContext): string => {
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
};

export const askQuestionPrompt = (
  question: string,
  context?: GitContext,
): string => {
  const contextString = formatGitContext(context);
  return `당신은 Git 초보자를 돕는 친절한 멘토입니다. 복잡한 용어 대신 쉬운 말로 설명하고, 구체적인 행동 지침을 제공하세요.

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
- Push (원격 저장소로 보내기)`;
};

export const suggestNextPrompt = (context: GitContext): string => {
  const contextString = formatGitContext(context);
  return `당신은 Git 초보자의 다음 작업을 제안하는 멘토입니다.

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
- [관련된 Git 개념들]`;
};

export const conflictResolutionPrompt = (
  conflictContent: string,
  filePath: string,
  fileExtension: string,
  language: string,
  context?: ConflictContext,
): string => {
  // 컨텍스트 정보 구성
  const contextInfo = context
    ? `
**Branch Context:**
- Our Branch (HEAD): ${context.ourBranch || "unknown"}
- Their Branch (merging): ${context.theirBranch || "unknown"}
- Our Commit Message: "${context.ourCommitMessage || "N/A"}"
- Their Commit Message: "${context.theirCommitMessage || "N/A"}"
`
    : "";

  return `You are an expert Git merge conflict resolver.

**CRITICAL: You MUST include all three sections: MERGED_CODE, EXPLANATION, and CONFIDENCE**

**File:** ${filePath} (${language})
${contextInfo}

---

## Quick Examples

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
};
