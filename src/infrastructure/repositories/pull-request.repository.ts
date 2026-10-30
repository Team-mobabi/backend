import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Effect, Option } from "effect";
import { Repository } from "typeorm";
import type { DbError } from "@src/common/error";
import {
  type PullRequest,
  PullRequestSchema,
  type PullRequestStatus,
  type Review,
  ReviewSchema,
  type ReviewStatus,
} from "@src/domain/pull-request/pull-request";
import {
  PrReview,
  ReviewStatus as EntityReviewStatus,
} from "@src/infrastructure/database/entities/pr-review.entity";
import {
  PullRequestStatus as EntityPrStatus,
  PullRequest as PullRequestEntity,
} from "@src/infrastructure/database/entities/pull-request.entity";
import { BaseRepository } from "./base.repository";

const ENTITY_PR_STATUS: Record<PullRequestStatus, EntityPrStatus> = {
  open: EntityPrStatus.OPEN,
  merged: EntityPrStatus.MERGED,
  closed: EntityPrStatus.CLOSED,
};

const ENTITY_REVIEW_STATUS: Record<ReviewStatus, EntityReviewStatus> = {
  approved: EntityReviewStatus.APPROVED,
  changes_requested: EntityReviewStatus.CHANGES_REQUESTED,
  commented: EntityReviewStatus.COMMENTED,
};

export interface NewPullRequest {
  readonly repoId: string;
  readonly authorId: string;
  readonly title: string;
  readonly description: string | null;
  readonly sourceBranch: string;
  readonly targetBranch: string;
}

@Injectable()
export class PullRequestRepository extends BaseRepository {
  constructor(
    @InjectRepository(PullRequestEntity)
    private readonly pullRequests: Repository<PullRequestEntity>,
    @InjectRepository(PrReview)
    private readonly reviews: Repository<PrReview>,
  ) {
    super();
  }

  find(
    repoId: string,
    id: string,
  ): Effect.Effect<Option.Option<PullRequest>, DbError> {
    return this.query(
      () => this.pullRequests.findOne({ where: { id, repoId } }),
      "Pull Request 조회에 실패했습니다",
    ).pipe(Effect.flatMap(this.toOption));
  }

  findOpen(
    repoId: string,
    sourceBranch: string,
    targetBranch: string,
  ): Effect.Effect<Option.Option<PullRequest>, DbError> {
    return this.query(
      () =>
        this.pullRequests.findOne({
          where: {
            repoId,
            sourceBranch,
            targetBranch,
            status: EntityPrStatus.OPEN,
          },
        }),
      "Pull Request 조회에 실패했습니다",
    ).pipe(Effect.flatMap(this.toOption));
  }

  list(
    repoId: string,
    status?: PullRequestStatus,
  ): Effect.Effect<readonly PullRequest[], DbError> {
    return this.query(
      () =>
        this.pullRequests.find({
          where:
            status === undefined
              ? { repoId }
              : { repoId, status: ENTITY_PR_STATUS[status] },
          order: { createdAt: "DESC" },
        }),
      "Pull Request 목록 조회에 실패했습니다",
    ).pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) => this.toModel(PullRequestSchema, row)),
      ),
    );
  }

  create(data: NewPullRequest): Effect.Effect<PullRequest, DbError> {
    return this.query(
      () =>
        this.pullRequests.save(
          this.pullRequests.create({ ...data, status: EntityPrStatus.OPEN }),
        ),
      "Pull Request 생성에 실패했습니다",
    ).pipe(Effect.flatMap((row) => this.toModel(PullRequestSchema, row)));
  }

  markMerged(
    pr: PullRequest,
    mergedBy: string,
    mergeCommitHash: string,
  ): Effect.Effect<PullRequest, DbError> {
    return this.update(pr.id, {
      status: EntityPrStatus.MERGED,
      mergedAt: new Date(),
      mergedBy,
      mergeCommitHash,
    });
  }

  markClosed(pr: PullRequest): Effect.Effect<PullRequest, DbError> {
    return this.update(pr.id, { status: EntityPrStatus.CLOSED });
  }

  countApprovals(pullRequestId: string): Effect.Effect<number, DbError> {
    return this.query(
      () =>
        this.reviews.count({
          where: { pullRequestId, status: EntityReviewStatus.APPROVED },
        }),
      "리뷰 조회에 실패했습니다",
    );
  }

  /** 리뷰어당 리뷰는 하나 — 다시 작성하면 덮어쓴다 */
  upsertReview(
    pullRequestId: string,
    reviewerId: string,
    status: ReviewStatus,
    comment: string | null,
  ): Effect.Effect<Review, DbError> {
    return this.query(async () => {
      const existing = await this.reviews.findOne({
        where: { pullRequestId, reviewerId },
      });
      const entity =
        existing ?? this.reviews.create({ pullRequestId, reviewerId });
      entity.status = ENTITY_REVIEW_STATUS[status];
      entity.comment = comment;
      return this.reviews.save(entity);
    }, "리뷰 저장에 실패했습니다").pipe(
      Effect.flatMap((row) => this.toModel(ReviewSchema, row)),
    );
  }

  listReviews(
    pullRequestId: string,
  ): Effect.Effect<readonly Review[], DbError> {
    return this.query(
      () =>
        this.reviews.find({
          where: { pullRequestId },
          order: { createdAt: "DESC" },
        }),
      "리뷰 목록 조회에 실패했습니다",
    ).pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) => this.toModel(ReviewSchema, row)),
      ),
    );
  }

  private update(
    id: string,
    patch: Partial<
      Pick<
        PullRequestEntity,
        "status" | "mergedAt" | "mergedBy" | "mergeCommitHash"
      >
    >,
  ): Effect.Effect<PullRequest, DbError> {
    return this.query(async () => {
      await this.pullRequests.update(id, patch);
      return this.pullRequests.findOneOrFail({ where: { id } });
    }, "Pull Request 수정에 실패했습니다").pipe(
      Effect.flatMap((row) => this.toModel(PullRequestSchema, row)),
    );
  }

  private readonly toOption = (
    row: PullRequestEntity | null,
  ): Effect.Effect<Option.Option<PullRequest>, DbError> =>
    row === null
      ? Effect.succeed(Option.none())
      : this.toModel(PullRequestSchema, row).pipe(Effect.map(Option.some));
}
