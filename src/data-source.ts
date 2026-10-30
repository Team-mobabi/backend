import { DataSource } from "typeorm";
import { ENTITIES } from "@src/infrastructure/database/entities";

// TypeORM CLI용. Bun은 .env를 자동으로 읽고, Node는 내장 loadEnvFile을 쓴다
try {
  process.loadEnvFile?.();
} catch {
  // .env가 없으면 환경변수만 사용
}

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT || "15432", 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: ENTITIES,
  migrations: ["src/migrations/*.ts"],
  synchronize: false,
});
