// Swagger 설명문. 컨트롤러 가독성을 위해 분리 (기존 문서 유지)

export const RESET_DESCRIPTION = `특정 커밋 시점으로 HEAD를 이동시킵니다.

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
`;

export const PULL_DESCRIPTION = `원격 저장소의 변경사항을 로컬로 가져옵니다.

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
`;

export const PUSH_DESCRIPTION = `로컬 변경사항을 원격 저장소로 업로드합니다.

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
`;

export const STATUS_DESCRIPTION = `저장소의 현재 상태와 파일 목록을 반환합니다.

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
`;

export const MERGE_DESCRIPTION = `소스 브랜치를 타겟 브랜치로 병합합니다.

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
`;

export const GRAPH_DESCRIPTION = `
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
    `;
