import { Schema } from "effect";
import {
  NonRootRepoPathSchema,
  RepoPathSchema,
} from "@src/domain/file/repo-path";
import {
  BranchNameSchema,
  RemoteNameSchema,
  RemoteUrlSchema,
  RevisionSchema,
} from "./ref";

const optionalRemote = Schema.optionalWith(RemoteNameSchema, {
  default: () => "origin",
});

const IntFromString = (min: number, max: number, fallback: number) =>
  Schema.optionalWith(
    Schema.NumberFromString.pipe(Schema.int(), Schema.between(min, max)),
    { default: () => fallback },
  );

// ── 작업 디렉토리 ──

export const StatusResultSchema = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({ name: Schema.String, status: Schema.String }),
  ),
  allFiles: Schema.Array(Schema.String),
  isEmpty: Schema.Boolean,
});

export const AddBodySchema = Schema.Struct({
  files: Schema.optional(Schema.Array(NonRootRepoPathSchema)),
});

export const AddResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  stagedFiles: Schema.Array(Schema.String),
});

export const CommitBodySchema = Schema.Struct({
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  branch: Schema.optional(BranchNameSchema),
});
export type CommitBody = Schema.Schema.Type<typeof CommitBodySchema>;

export const CommitResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  commitHash: Schema.String,
  message: Schema.String,
  committedAt: Schema.String,
  stats: Schema.Struct({
    changes: Schema.Number,
    insertions: Schema.Number,
    deletions: Schema.Number,
  }),
});

export const ResetModeSchema = Schema.Literal("hard", "soft", "mixed");
export type ResetMode = Schema.Schema.Type<typeof ResetModeSchema>;

export const ResetBodySchema = Schema.Struct({
  commitHash: RevisionSchema,
  mode: Schema.optionalWith(ResetModeSchema, {
    default: () => "mixed" as const,
  }),
});

export const ResetResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  mode: ResetModeSchema,
  from: Schema.String,
  to: Schema.String,
  branch: Schema.String,
  modified: Schema.Array(Schema.String),
  staged: Schema.Array(Schema.String),
  message: Schema.String,
});

// ── 리모트 ──

export const AddRemoteBodySchema = Schema.Struct({
  url: RemoteUrlSchema,
  name: optionalRemote,
});

export const CreateLocalRemoteBodySchema = Schema.Struct({
  name: optionalRemote,
});

export const LocalRemoteResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  remotePath: Schema.String,
  remoteName: Schema.String,
});

export const PullBodySchema = Schema.Struct({
  remote: optionalRemote,
  branch: Schema.optional(BranchNameSchema),
  ffOnly: Schema.optionalWith(Schema.Boolean, { default: () => false }),
});
export type PullBody = Schema.Schema.Type<typeof PullBodySchema>;

export const PullResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  fastForward: Schema.Boolean,
  from: Schema.String,
  to: Schema.String,
  hasConflict: Schema.Boolean,
  conflictFiles: Schema.Array(Schema.String),
});
export type PullResult = Schema.Schema.Type<typeof PullResultSchema>;

export const PushBodySchema = Schema.Struct({
  remote: optionalRemote,
  branch: Schema.optional(BranchNameSchema),
  force: Schema.optionalWith(Schema.Boolean, { default: () => false }),
});
export type PushBody = Schema.Schema.Type<typeof PushBodySchema>;

export const PushResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  upToDate: Schema.Boolean,
  pushed: Schema.Array(
    Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  ),
});
export type PushResult = Schema.Schema.Type<typeof PushResultSchema>;

// ── 브랜치 ──

export const BranchListQuerySchema = Schema.Struct({
  limit: IntFromString(1, 1000, 20),
});

export const BranchListSchema = Schema.Struct({
  branches: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      pushedCommits: Schema.Array(
        Schema.Struct({
          hash: Schema.String,
          message: Schema.String,
          author: Schema.String,
          committedAt: Schema.String,
        }),
      ),
      isCurrent: Schema.Boolean,
    }),
  ),
  currentBranch: Schema.String,
});

export const CreateBranchBodySchema = Schema.Struct({
  name: BranchNameSchema,
  from: Schema.optional(RevisionSchema),
});

export const CreateBranchResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  message: Schema.String,
  branchName: Schema.String,
  currentBranch: Schema.String,
  currentCommit: Schema.String,
  baseBranch: Schema.NullOr(Schema.String),
});

export const SwitchBranchBodySchema = Schema.Struct({ name: BranchNameSchema });

export const SwitchBranchResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  currentBranch: Schema.String,
});

export const DeleteBranchResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  message: Schema.String,
});

export const MergeBranchBodySchema = Schema.Struct({
  sourceBranch: RevisionSchema,
  targetBranch: Schema.optional(BranchNameSchema),
  fastForwardOnly: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
});
export type MergeBranchBody = Schema.Schema.Type<typeof MergeBranchBodySchema>;

export const MergeResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  fastForward: Schema.Boolean,
  from: Schema.String,
  to: Schema.String,
  sourceBranch: Schema.String,
  targetBranch: Schema.String,
  hasConflict: Schema.Boolean,
  conflictFiles: Schema.Array(Schema.String),
});
export type MergeResult = Schema.Schema.Type<typeof MergeResultSchema>;

export const GraphQuerySchema = Schema.Struct({
  since: Schema.optional(RevisionSchema),
  max: IntFromString(1, 2000, 200),
});

// ── diff ──

export const DiffPathQuerySchema = Schema.Struct({
  path: Schema.optional(RepoPathSchema),
});

export const BranchDiffQuerySchema = Schema.Struct({
  source: BranchNameSchema,
  target: BranchNameSchema,
  path: Schema.optional(RepoPathSchema),
});

export const CommitRangeQuerySchema = Schema.Struct({
  commitA: Schema.optional(RevisionSchema),
  commitB: Schema.optional(RevisionSchema),
});
