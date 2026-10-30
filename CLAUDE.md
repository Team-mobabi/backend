# Git Service Backend - 프로젝트 규칙

이 파일은 Claude Code가 코드를 작성할 때 항상 따라야 하는 규칙입니다.

## 1. 계층 구조

의존 방향은 `presentation → application → infrastructure / domain` 한 방향입니다. 역방향 import 금지.

| 계층 | 위치 | 역할 |
|---|---|---|
| domain | `src/domain/<feature>/` | Effect Schema 모델·요청/응답 스키마, 순수 함수. Nest/TypeORM/git 의존 금지 |
| application | `src/application/<feature>/` | 유스케이스 서비스. 모든 메서드는 `Effect.Effect<A, E>` 반환 |
| infrastructure | `src/infrastructure/` | TypeORM 엔티티·리포지토리, git·파일시스템·메일·Claude 클라이언트 |
| presentation | `src/presentation/<feature>/` | 컨트롤러, Nest 모듈, Swagger 설명문(`*.docs.ts`) |
| common | `src/common/` | 태그드 에러(`error/`), Effect 헬퍼(`effect.ts`) |

- **파일 네이밍**: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.repository.ts`, `*.entity.ts`, `*.client.ts`, `*.docs.ts`, 테스트는 `*.test.ts`
- **경로 alias**: `@src/*` 사용
- **코드 스타일**: Biome이 기준 (2 spaces, 쌍따옴표, 세미콜론). ESLint/Prettier 사용 금지

## 2. 타입과 도메인 모델

- **any 금지**, 타입 단언(`as`)은 외부 라이브러리 경계에서만 최소한으로
- **도메인 타입은 `src/domain`의 Schema에서만 추출** (`Schema.Schema.Type<typeof XSchema>`). 같은 구조의 interface를 다른 곳에 재정의하지 않는다
- **TypeORM 엔티티는 repository 밖으로 내보내지 않는다.** repository에서 `this.toModel(Schema, entity)`로 도메인 모델로 바꿔 반환 (비밀번호 해시 등 스키마에 없는 필드는 자동 제거됨)
- 사용자 입력이 경로·git 인자로 쓰이면 반드시 브랜드/검증 스키마를 거친다
  - 파일 경로: `RepoPathSchema` / `NonRootRepoPathSchema` (`domain/file/repo-path.ts`)
  - 브랜치·커밋·리모트: `BranchNameSchema`, `RevisionSchema`, `RemoteNameSchema`, `RemoteUrlSchema` (`domain/git/ref.ts`)
  - 파일 시스템 접근은 `resolveInside()`로 절대 경로를 얻은 뒤에만

## 3. 요청 검증과 에러 처리

- 컨트롤러는 `BaseController`를 상속하고, 입력은 `@Body() body: unknown` / `@Query() query: unknown`으로 받아 `this.decode(Schema, body)`로 검증한다. class-validator DTO 사용 금지
- 서비스 결과는 `this.runEffect(effect)`로 반환한다
- 실패는 `Data.TaggedError`로 정의(`src/common/error/*.error.ts`)하고 `AppError` union에 추가한 뒤, `presentation/base.controller.ts`의 `STATUS_BY_TAG`에 HTTP 상태를 매핑한다 (누락 시 컴파일 에러)
- 추가 응답 필드가 필요하면 에러의 `details`에 넣는다 (응답 본문에 펼쳐짐)
- NestJS `HttpException`을 서비스에서 직접 던지지 않는다
- git 원본 에러 메시지에는 서버 경로가 섞이므로 500 응답에 그대로 노출하지 않는다 (`tryGit`, `recoverGit` 사용)

## 4. 권한

- 레포 관련 작업은 `RepoWorkspaceService`를 거친다
  - 작업 사본이 필요하면 `open(repoId, userId, role)`, DB만 다루면 `authorize(repoId, userId, role)`
- 공유 원격이나 공유 상태를 바꾸는 작업(push, PR merge/review, 협업자 관리 등)은 `write` 이상을 요구한다

## 5. 데이터베이스

- Raw SQL 대신 TypeORM Repository / QueryBuilder 사용
- 여러 테이블을 바꾸는 작업은 `manager.transaction` 안에서 처리
- 엔티티 목록은 `src/infrastructure/database/entities/index.ts`의 `ENTITIES` 한 곳에서 관리
- 엔티티(스키마)를 바꾸면 마이그레이션을 함께 추가한다 (운영은 `synchronize: false`)

## 6. Swagger 문서 상시 업데이트

모든 API 변경 시 **반드시** Swagger 문서도 함께 수정합니다. 스키마는 손으로 쓰지 않고 도메인 스키마에서 생성한다.

```typescript
@ApiOperation({ summary: "간단한 요약 (1줄)", description: "상세 설명 (필요시)" })
@ApiBody({ schema: apiSchema(CreateXBodySchema) })
@ApiResponse({ status: 200, description: "성공 시 응답 설명", schema: apiSchema(XSchema) })
@ApiResponse({ status: 404, description: "실패 시 응답 설명" })
```

- 긴 설명문(예시 포함)은 `<feature>.docs.ts`로 분리
- 수정이 필요한 경우: API 추가, 응답 형태 변경, 쿼리/바디 변경, 권한 요구사항 변경, 에러 응답 추가/변경

## 7. 쓸모없는 주석 적지 않기

### ❌ 나쁜 예 (작성하지 말 것)
```typescript
// 사용자 ID를 가져옵니다
const userId = user.id;
```

### ✅ 좋은 예 (작성해도 되는 경우)
```typescript
// IMPORTANT: --mirror여야 원본의 모든 브랜치/태그가 복사된다
yield* tryGit("clone --mirror", () => simpleGit().clone(src, dest, ["--mirror"]));
```

**주석 작성 기준:**
- 코드만 봐서는 **왜** 이렇게 했는지 알 수 없을 때만 작성
- 복잡한 비즈니스 로직의 의도, 임시 해결책(workaround)이나 주의사항
- 도메인 로직은 한국어, 기계적 코드는 영어 또는 생략

## 8. 테스트와 검증

코드를 수정한 뒤에는 아래를 실행하고, 실패하면 커밋하지 않는다.

```bash
bun run lint       # Biome
bun run tsc        # 타입 체크 (incremental 캐시 없이)
bun run test       # Vitest
bun run check:di   # DI 그래프 조립 확인 (.env 필요)
bun run build
```

- 서비스 단위 테스트는 의존성을 직접 생성해서 주입한다 (`new Service(mock)`). Vitest는 decorator metadata를 내보내지 않아 Nest DI 테스트 모듈을 쓸 수 없다
- 같은 이유로, 주입받는 클래스는 `import type`으로 가져오면 DI가 깨진다. Biome override가 Nest 파일 패턴(`*.service.ts`, `*.client.ts` 등)에서 `useImportType`을 끄고 있으니, 새 provider 파일은 이 패턴을 따르고 `check:di`로 확인한다
- git 동작은 임시 디렉토리의 실제 저장소로 테스트한다 (`src/application/git/git.integration.test.ts` 참고)
- mock이 Effect를 반환할 때는 메서드 호출 횟수가 아니라 실행 여부를 검증한다 (Effect는 지연 실행)

## 9. 기타

- **패키지 관리**: 불필요한 패키지 설치 금지, 사용하지 않는 패키지 제거, 추가 시 이유 명시
- **Bun 사용**: npm/npx 대신 bun/bunx
- **로깅**: `console` 대신 NestJS `Logger` (평가 스크립트 `src/application/ai/evaluation/`과 `scripts/`는 예외)
- **Claude 모델**: 코드에 하드코딩하지 않는다. `ClaudeClient`의 기본값 또는 `CLAUDE_MODEL` 환경변수
- **커밋/PR**: Claude attribution(`Co-Authored-By` 등)을 넣지 않는다

---

이 규칙을 위반하는 코드 작성 시, 반드시 사용자에게 확인을 받아야 합니다.
