import { Schema } from "effect";
import { RepoPathSchema } from "@src/domain/file/repo-path";
import { MergeResultSchema } from "@src/domain/git/git";
import { BranchNameSchema } from "@src/domain/git/ref";

export const PullRequestIdSchema = Schema.UUID.annotations({
  description: "Pull Request ID",
});

export const PullRequestStatusSchema = Schema.Literal(
  "open",
  "merged",
  "closed",
);
export type PullRequestStatus = Schema.Schema.Type<
  typeof PullRequestStatusSchema
>;

export const PullRequestSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  sourceBranch: Schema.String,
  targetBranch: Schema.String,
  authorId: Schema.String,
  status: PullRequestStatusSchema,
  mergedAt: Schema.NullOr(Schema.Date),
  mergedBy: Schema.NullOr(Schema.String),
  mergeCommitHash: Schema.NullOr(Schema.String),
  requiresApproval: Schema.Boolean,
  repoId: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
});
export type PullRequest = Schema.Schema.Type<typeof PullRequestSchema>;
export const PullRequestListSchema = Schema.Array(PullRequestSchema);

export const ReviewStatusSchema = Schema.Literal(
  "approved",
  "changes_requested",
  "commented",
);
export type ReviewStatus = Schema.Schema.Type<typeof ReviewStatusSchema>;

export const ReviewSchema = Schema.Struct({
  id: Schema.String,
  pullRequestId: Schema.String,
  reviewerId: Schema.String,
  status: ReviewStatusSchema,
  comment: Schema.NullOr(Schema.String),
  createdAt: Schema.Date,
});
export type Review = Schema.Schema.Type<typeof ReviewSchema>;
export const ReviewListSchema = Schema.Array(ReviewSchema);

export const CreatePullRequestBodySchema = Schema.Struct({
  title: Schema.NonEmptyString,
  description: Schema.optional(Schema.String),
  sourceBranch: BranchNameSchema,
  targetBranch: BranchNameSchema,
});
export type CreatePullRequestBody = Schema.Schema.Type<
  typeof CreatePullRequestBodySchema
>;

export const PullRequestListQuerySchema = Schema.Struct({
  status: Schema.optional(PullRequestStatusSchema),
});

export const MergePullRequestBodySchema = Schema.Struct({
  fastForwardOnly: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
});

export const MergePullRequestResultSchema = Schema.Struct({
  ...MergeResultSchema.fields,
  pullRequest: PullRequestSchema,
});

export const CreateReviewBodySchema = Schema.Struct({
  status: ReviewStatusSchema,
  comment: Schema.optional(Schema.String),
});
export type CreateReviewBody = Schema.Schema.Type<
  typeof CreateReviewBodySchema
>;

export const PullRequestDiffQuerySchema = Schema.Struct({
  path: Schema.optional(RepoPathSchema),
});
