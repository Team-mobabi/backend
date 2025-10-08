import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  PullRequest,
  PullRequestStatus,
} from "@src/repos/entities/pull-request.entity";
import { PrReview, ReviewStatus } from "@src/repos/entities/pr-review.entity";
import { Repo } from "@src/repos/entities/repo.entity";
import { CreatePullRequestDto } from "@src/repos/dto/create-pull-request.dto";
import { CreateReviewDto } from "@src/repos/dto/create-review.dto";
import { ConfigService } from "@nestjs/config";
import { BranchService } from "./branch.service";
import { BaseRepoService } from "@src/repos/services/base-repo.service";

@Injectable()
export class PullRequestService extends BaseRepoService {
  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    @InjectRepository(PullRequest)
    private readonly pullRequestRepository: Repository<PullRequest>,
    @InjectRepository(PrReview)
    private readonly prReviewRepository: Repository<PrReview>,
    private readonly branchService: BranchService,
    configService: ConfigService,
  ) {
    super(repoRepository, configService);
  }

  async createPullRequest(
    repoId: string,
    userId: string,
    createPullRequestDto: CreatePullRequestDto,
  ) {
    const { git } = await this.getRepoAndGit(repoId, userId);

    const branches = await git.branchLocal();
    if (!branches.all.includes(createPullRequestDto.sourceBranch)) {
      throw new NotFoundException(
        `Source branch '${createPullRequestDto.sourceBranch}' not found`,
      );
    }
    if (!branches.all.includes(createPullRequestDto.targetBranch)) {
      throw new NotFoundException(
        `Target branch '${createPullRequestDto.targetBranch}' not found`,
      );
    }

    if (
      createPullRequestDto.sourceBranch === createPullRequestDto.targetBranch
    ) {
      throw new ConflictException(
        "Source and target branches cannot be the same",
      );
    }

    const existingPR = await this.pullRequestRepository.findOne({
      where: {
        repoId,
        sourceBranch: createPullRequestDto.sourceBranch,
        targetBranch: createPullRequestDto.targetBranch,
        status: PullRequestStatus.OPEN,
      },
    });

    if (existingPR) {
      throw new ConflictException(
        "A pull request already exists for these branches",
      );
    }

    const pullRequest = this.pullRequestRepository.create({
      ...createPullRequestDto,
      repoId,
      authorId: userId,
      status: PullRequestStatus.OPEN,
    });

    return this.pullRequestRepository.save(pullRequest);
  }

  async getPullRequests(
    repoId: string,
    userId: string,
    status?: PullRequestStatus,
  ) {
    await this.getRepoAndGit(repoId, userId);

    const whereCondition: { repoId: string; status?: PullRequestStatus } = {
      repoId,
    };
    if (status) {
      whereCondition.status = status;
    }

    return this.pullRequestRepository.find({
      where: whereCondition,
      order: { createdAt: "DESC" },
    });
  }

  async getPullRequest(repoId: string, userId: string, prId: string) {
    await this.getRepoAndGit(repoId, userId);

    const pullRequest = await this.pullRequestRepository.findOne({
      where: { id: prId, repoId },
    });

    if (!pullRequest) {
      throw new NotFoundException("Pull request not found");
    }

    return pullRequest;
  }

  async mergePullRequest(
    repoId: string,
    userId: string,
    prId: string,
    fastForwardOnly = false,
  ) {
    const pullRequest = await this.getPullRequest(repoId, userId, prId);

    if (pullRequest.status !== PullRequestStatus.OPEN) {
      throw new ConflictException("Pull request is not open");
    }

    if (pullRequest.requiresApproval) {
      const approvedReviews = await this.prReviewRepository.find({
        where: {
          pullRequestId: prId,
          status: ReviewStatus.APPROVED,
        },
      });

      if (approvedReviews.length === 0) {
        throw new ConflictException(
          "Pull request requires at least one approval before merging",
        );
      }
    }

    const mergeResult = await this.branchService.mergeBranch(
      repoId,
      userId,
      pullRequest.sourceBranch,
      pullRequest.targetBranch,
      fastForwardOnly,
    );
    pullRequest.status = PullRequestStatus.MERGED;
    pullRequest.mergedAt = new Date();
    pullRequest.mergedBy = userId;
    pullRequest.mergeCommitHash = mergeResult.to;

    await this.pullRequestRepository.save(pullRequest);

    return {
      ...mergeResult,
      pullRequest,
    };
  }

  async closePullRequest(repoId: string, userId: string, prId: string) {
    const pullRequest = await this.getPullRequest(repoId, userId, prId);

    if (pullRequest.status !== PullRequestStatus.OPEN) {
      throw new ConflictException("Pull request is not open");
    }

    pullRequest.status = PullRequestStatus.CLOSED;
    await this.pullRequestRepository.save(pullRequest);

    return pullRequest;
  }

  async createReview(
    repoId: string,
    userId: string,
    prId: string,
    createReviewDto: CreateReviewDto,
  ) {
    const pullRequest = await this.getPullRequest(repoId, userId, prId);

    if (pullRequest.status !== PullRequestStatus.OPEN) {
      throw new ConflictException("Cannot review a closed pull request");
    }

    if (pullRequest.authorId === userId) {
      throw new ConflictException("Cannot review your own pull request");
    }
    let review = await this.prReviewRepository.findOne({
      where: {
        pullRequestId: prId,
        reviewerId: userId,
      },
    });

    if (review) {
      review.status = createReviewDto.status;
      review.comment = createReviewDto.comment || null;
    } else {
      review = this.prReviewRepository.create({
        pullRequestId: prId,
        reviewerId: userId,
        ...createReviewDto,
      });
    }

    return this.prReviewRepository.save(review);
  }

  async getReviews(repoId: string, userId: string, prId: string) {
    await this.getPullRequest(repoId, userId, prId);

    return this.prReviewRepository.find({
      where: { pullRequestId: prId },
      order: { createdAt: "DESC" },
    });
  }
}