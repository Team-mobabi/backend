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
