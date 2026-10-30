import { Schema } from "effect";

const AppConfigSchema = Schema.Struct({
  ENV: Schema.Literal("dev", "prod"),
  PORT: Schema.optionalWith(Schema.NumberFromString, { default: () => 3000 }),

  JWT_SECRET: Schema.NonEmptyString,
  JWT_EXPIRES_IN: Schema.NonEmptyString,

  DB_TYPE: Schema.Literal("postgres"),
  DB_HOST: Schema.NonEmptyString,
  DB_PORT: Schema.NumberFromString,
  DB_USERNAME: Schema.NonEmptyString,
  DB_PASSWORD: Schema.NonEmptyString,
  DB_DATABASE: Schema.NonEmptyString,

  EMAIL_HOST: Schema.NonEmptyString,
  EMAIL_PORT: Schema.NumberFromString,
  EMAIL_SECURE: Schema.Literal("true", "false"),
  EMAIL_USER: Schema.NonEmptyString,
  EMAIL_PASSWORD: Schema.NonEmptyString,
  EMAIL_FROM: Schema.NonEmptyString,

  REPO_BASE_PATH: Schema.optional(Schema.NonEmptyString),
  REMOTE_BASE_PATH: Schema.optional(Schema.NonEmptyString),
  REPO_LOCAL_BASE_PATH: Schema.optional(Schema.NonEmptyString),
  REMOTE_LOCAL_BASE_PATH: Schema.optional(Schema.NonEmptyString),

  // 없으면 AI 기능만 비활성화
  CLAUDE_API_KEY: Schema.optional(Schema.NonEmptyString),
  // 기본값은 ClaudeClient에 정의. 평가 재현 등으로 모델을 고정할 때 사용
  CLAUDE_MODEL: Schema.optional(Schema.NonEmptyString),
});

export type AppConfig = Schema.Schema.Type<typeof AppConfigSchema>;

export const appConfigValidate = (config: Record<string, unknown>): AppConfig =>
  Schema.decodeUnknownSync(AppConfigSchema, { errors: "all" })(config);
