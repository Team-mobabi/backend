import { DataSource } from "typeorm";
import { config } from "dotenv";
import { Repo } from "@src/infrastructure/database/entities/repo.entity";
import { PullRequest } from "@src/infrastructure/database/entities/pull-request.entity";
import { PrReview } from "@src/infrastructure/database/entities/pr-review.entity";
import { User } from "@src/infrastructure/database/entities/user.entity";
import { EmailVerification } from "@src/infrastructure/database/entities/email-verification.entity";

// .env 파일 로드
config();

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT || "15432"),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [Repo, PullRequest, PrReview, User, EmailVerification],
  migrations: ["src/migrations/*.ts"],
  synchronize: false, // 마이그레이션 사용 시 false
});
