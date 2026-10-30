/**
 * DB 없이 전체 AppModule의 의존성 그래프를 조립해 본다.
 * Vitest(esbuild)는 decorator metadata를 내보내지 않아 DI 오류(예: `import type`으로
 * 주입 대상이 지워진 경우)를 잡지 못하므로, Bun으로 실제 Nest 컨테이너를 띄워 확인한다.
 *
 * 실행: bun run check:di
 */
import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { getDataSourceToken } from "@nestjs/typeorm";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "@src/app.module";

const fakeDataSource = {
  options: { type: "postgres" },
  isInitialized: true,
  entityMetadatas: [],
  getRepository: () => ({}),
  manager: {},
  destroy: async () => undefined,
};

const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(getDataSourceToken())
  .useValue(fakeDataSource)
  .compile();

const app = moduleRef.createNestApplication({ logger: ["error"] });
await app.init();

const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
const operations = Object.values(document.paths).flatMap((item) =>
  Object.keys(item),
);
const tags = [...new Set(Object.values(document.paths).flatMap((item) =>
  Object.values(item).flatMap((op) => (op as { tags?: string[] }).tags ?? []),
))].sort();

console.log(`DI OK — ${operations.length} operations, tags: ${tags.join(", ")}`);
await app.close();
