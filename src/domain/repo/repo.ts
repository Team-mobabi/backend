import { Schema } from "effect";

export const RepoIdSchema = Schema.UUID.annotations({
  description: "레포지토리 ID",
});
export type RepoId = Schema.Schema.Type<typeof RepoIdSchema>;

export const RepoSchema = Schema.Struct({
  repoId: RepoIdSchema,
  ownerId: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  isPrivate: Schema.Boolean,
  forkedFrom: Schema.NullOr(Schema.String),
  createdAt: Schema.Date,
});
export type Repo = Schema.Schema.Type<typeof RepoSchema>;

export const RepoOwnerSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
});

/** 목록/상세 응답 — 소유자 이메일 포함 */
export const RepoViewSchema = Schema.Struct({
  ...RepoSchema.fields,
  owner: Schema.optional(RepoOwnerSchema),
});
export type RepoView = Schema.Schema.Type<typeof RepoViewSchema>;

export const RepoViewListSchema = Schema.Array(RepoViewSchema);

export const CreateRepoBodySchema = Schema.Struct({
  name: Schema.String.pipe(
    Schema.minLength(3, {
      message: () => "저장소 이름은 3에서 50자 사이여야 합니다.",
    }),
    Schema.maxLength(50, {
      message: () => "저장소 이름은 3에서 50자 사이여야 합니다.",
    }),
  ).annotations({ description: "레포지토리 이름", examples: ["my-project"] }),
  description: Schema.optional(Schema.String),
  isPrivate: Schema.optionalWith(Schema.Boolean, { default: () => false }),
});
export type CreateRepoBody = Schema.Schema.Type<typeof CreateRepoBodySchema>;

export const ForkRepoBodySchema = Schema.Struct({
  sourceRepoId: RepoIdSchema,
  name: Schema.optional(
    Schema.String.annotations({
      description: "Fork된 레포지토리 이름 (기본값: 원본 이름)",
    }),
  ),
  isPrivate: Schema.optionalWith(Schema.Boolean, { default: () => false }),
});
export type ForkRepoBody = Schema.Schema.Type<typeof ForkRepoBodySchema>;

export const SuccessSchema = Schema.Struct({ success: Schema.Literal(true) });
