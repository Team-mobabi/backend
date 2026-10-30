// Swagger 설명문. 컨트롤러 가독성을 위해 분리 (기존 문서 유지)

export const CONFLICTS_DESCRIPTION =
  "현재 레포지토리의 충돌 상태와 충돌 파일 목록을 반환합니다.";

export const RESOLVE_DESCRIPTION = `충돌이 발생한 파일을 해결합니다.

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
\`\`\``;

export const ABORT_DESCRIPTION =
  "진행 중인 병합을 취소하고 이전 상태로 되돌립니다.";

export const AI_SUGGEST_DESCRIPTION = `Claude AI가 충돌 파일을 분석하고 최적의 병합 제안을 제공합니다.

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

**참고:** CLAUDE_API_KEY 환경변수가 설정되어 있어야 합니다.`;

export const ASK_DESCRIPTION = `초보자가 Git 사용 중 궁금한 점을 질문하면 AI가 친절하게 답변합니다.

**사용 예시:**
- "브랜치가 뭔가요?"
- "커밋을 어떻게 취소하나요?"
- "충돌이 발생했는데 어떻게 해결하나요?"
- "지금 무엇을 해야 하나요?"

**특징:**
- 초보자 친화적인 쉬운 설명
- 현재 저장소 상태를 고려한 맞춤형 답변
- 구체적인 행동 지침 제공
- 관련 개념 함께 안내`;

export const SUGGEST_NEXT_DESCRIPTION = `현재 저장소 상태를 분석하여 다음에 무엇을 해야 할지 AI가 제안합니다.

**분석 항목:**
- 커밋되지 않은 변경사항
- 스테이징된 파일
- 충돌 상태
- 현재 브랜치
- 최근 커밋 이력

**제안 예시:**
- "변경사항을 커밋하세요"
- "충돌을 먼저 해결하세요"
- "작업이 완료되었으니 Pull Request를 생성하세요"`;
