import { Schema } from "effect";
import { NonRootRepoPathSchema } from "@src/domain/file/repo-path";

export const ConflictInfoSchema = Schema.Struct({
  hasConflict: Schema.Boolean,
  conflictFiles: Schema.Array(Schema.String),
  message: Schema.optional(Schema.String),
});

export const ConflictResolutionSchema = Schema.Literal(
  "ours",
  "theirs",
  "manual",
);

/** manual이면 manualContent가 반드시 있어야 한다 */
export const ResolveConflictBodySchema = Schema.Union(
  Schema.Struct({
    filePath: NonRootRepoPathSchema,
    resolution: Schema.Literal("ours", "theirs"),
  }),
  Schema.Struct({
    filePath: NonRootRepoPathSchema,
    resolution: Schema.Literal("manual"),
    manualContent: Schema.String,
  }),
);
export type ResolveConflictBody = Schema.Schema.Type<
  typeof ResolveConflictBodySchema
>;

export const ConflictActionResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  message: Schema.String,
});
