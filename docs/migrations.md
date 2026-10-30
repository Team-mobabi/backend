# DB 마이그레이션

prod는 `synchronize: false`(`src/app.module.ts`)로 동작하므로 스키마 변경은 반드시
`src/migrations/`의 마이그레이션으로 반영한다. dev는 여전히 `synchronize: true`이다.

TypeORM CLI는 Bun으로 실행하며 `src/data-source.ts`(엔티티 목록은
`src/infrastructure/database/entities/index.ts`)를 사용한다. 접속 정보는 `.env`의
`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`를 읽는다.

| 명령 | 설명 |
| --- | --- |
| `bun run migration:show` | 적용/미적용 목록 (`[X]` = 적용됨) |
| `bun run migration:run` | 미적용 마이그레이션 실행 |
| `bun run migration:revert` | 마지막 마이그레이션 1개 되돌리기 |
| `bun run migration:generate src/migrations/<Name>` | 엔티티와 DB의 차이로 새 마이그레이션 생성 |
| `bun run migration:generate src/migrations/Check --check` | 차이가 없는지만 확인 (있으면 exit 1) |

## 새 마이그레이션 만들기

1. 엔티티를 수정한다.
2. 마이그레이션이 모두 적용된 **빈 로컬 DB**를 기준으로 생성한다.
   (`synchronize: true`로 이미 바뀐 dev DB에서는 차이가 잡히지 않는다)
   ```bash
   docker run -d --name pg-migr -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app \
     -e POSTGRES_DB=app -p 25432:5432 postgres:16-alpine
   export DB_HOST=localhost DB_PORT=25432 DB_USERNAME=app DB_PASSWORD=app DB_DATABASE=app
   bun run migration:run
   bun run migration:generate src/migrations/AddSomething
   ```
3. 생성된 파일을 검토하고 `bun run lint:fix`로 포맷한 뒤, `migration:run` →
   `migration:revert` → `migration:run`으로 up/down을 확인한다.

## 기존 prod DB에 baseline 표시하기 (최초 1회)

`InitialSchema1793333817052`는 현재 엔티티 전체를 생성하는 baseline이다. 기존 prod DB는
예전에 `synchronize`로 이미 같은 스키마가 만들어져 있으므로 **실행하지 말고** 적용된
것으로만 기록한다. 실행하면 `CREATE TABLE`이 이미 있는 테이블과 충돌해 실패한다.

1. DB를 백업한다 (`pg_dump`).
2. prod DB에 접속해 마이그레이션 기록 테이블을 만들고 baseline을 등록한다.
   ```sql
   CREATE TABLE IF NOT EXISTS "migrations" (
     "id" SERIAL PRIMARY KEY,
     "timestamp" bigint NOT NULL,
     "name" character varying NOT NULL
   );
   INSERT INTO "migrations" ("timestamp", "name")
   VALUES (1793333817052, 'InitialSchema1793333817052');
   ```
3. prod 접속 정보로 확인한다.
   ```bash
   bun run migration:show        # [X] InitialSchema1793333817052
   bun run migration:generate src/migrations/Check --check
   ```
   `--check`가 차이를 보고하면 prod 스키마가 엔티티와 어긋나 있는 것이다. 이 경우
   차이를 메우는 마이그레이션을 따로 만들어 검토한 뒤 적용한다.
4. 이후 마이그레이션은 `bun run migration:run`으로 적용한다.

새 환경(빈 DB)에서는 표시 없이 `bun run migration:run`만 하면 baseline부터 모두 생성된다.

## 배포 시 순서

마이그레이션 CLI는 `src/migrations/*.ts`를 Bun으로 직접 읽으므로 소스가 있는 위치에서
실행한다. 새 코드를 띄우기 **전에** `bun run migration:run`을 실행한다.

## 배포 시 주의가 필요한 마이그레이션

- `HashRefreshTokens1793334070792`: refresh 토큰을 SHA-256 해시로만 저장하도록 바꾸면서
  기존에 저장된 토큰을 모두 버린다. 적용 직후 기존 refresh 토큰은 모두 거부되므로,
  로그인해 있던 사용자는 access 토큰(1시간)이 만료되면 다시 로그인해야 한다.
