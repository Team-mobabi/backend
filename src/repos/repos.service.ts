import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { Repo } from "@src/repos/entities/repo.entity";
import { PullRequest, PullRequestStatus } from "@src/repos/entities/pull-request.entity";
import { PrReview, ReviewStatus } from "@src/repos/entities/pr-review.entity";
import { CreateRepoDto } from "@src/repos/dto/create-repo.dto";
import { CreatePullRequestDto } from "@src/repos/dto/create-pull-request.dto";
import { CreateReviewDto } from "@src/repos/dto/create-review.dto";

import * as path from "node:path";
import { promises as fs } from "node:fs";

import simpleGit, {
  BranchSummaryBranch,
  DefaultLogFields,
  SimpleGit,
} from "simple-git";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ReposService {
  private readonly repoBasePath: string;
  private readonly remoteBasePath: string;

  constructor(
    @InjectRepository(Repo)
    private readonly repoRepository: Repository<Repo>,
    @InjectRepository(PullRequest)
    private readonly pullRequestRepository: Repository<PullRequest>,
    @InjectRepository(PrReview)
    private readonly prReviewRepository: Repository<PrReview>,
    private readonly configService: ConfigService,
  ) {
    this.repoBasePath = this.configService.get<string>(
      "REPO_LOCAL_BASE_PATH",
      "data/git",
    );
    this.remoteBasePath = this.configService.get<string>(
      "REMOTE_LOCAL_BASE_PATH",
      "data/remote",
    );
  }

  private async _getRepoAndGitInstance(
    repoId: string,
    userId: string,
  ): Promise<{ repo: Repo; git: SimpleGit }> {
    const repo = await this.repoRepository.findOne({ where: { repoId } });
    if (!repo) {
      throw new NotFoundException("Repository not found");
    }

    if (repo.ownerId !== userId) {
      throw new ForbiddenException(
        "You do not have permission to access this repository.",
      );
    }

    if (!repo.gitPath) {
      throw new InternalServerErrorException(
        "Repository path is not configured.",
      );
    }

    await this.ensureDirectoryExists(repo.gitPath);
    const git = simpleGit(repo.gitPath);
    return { repo, git };
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (err) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  async createRepo(
    createRepoDto: CreateRepoDto,
    ownerId: string,
  ): Promise<Repo> {
    const newRepo = this.repoRepository.create({ ...createRepoDto, ownerId });
    const savedRepo = await this.repoRepository.save(newRepo);

    savedRepo.gitPath = path.join(this.repoBasePath, savedRepo.repoId);

    try {
      await this.ensureDirectoryExists(savedRepo.gitPath);
      const git = simpleGit(savedRepo.gitPath);

      await git.init(false, { "--initial-branch": "main" });

      await git.addConfig("commit.gpgsign", "false");

      await git.commit("Initial commit", undefined, {
        "--allow-empty": null,
        "--no-gpg-sign": null,
      });

      return this.repoRepository.save(savedRepo);
    } catch (error) {
      await this.repoRepository.delete(savedRepo.repoId);
      throw new InternalServerErrorException(
        `Failed to initialize repository: ${error.message}`,
      );
    }
  }

  async findReposByOwner(userId: string): Promise<Repo[]> {
    return this.repoRepository.find({
      where: { ownerId: userId },
      order: { createdAt: "DESC" },
    });
  }

  async pullRepo(
    repoId: string,
    userId: string,
    remote = "origin",
    branch?: string,
    ffOnly = false,
  ) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);
    
    const targetBranch = branch || (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

    const remoteRefCheck = await git.raw([
      "ls-remote",
      "--heads",
      remote,
      targetBranch,
    ]);
    if (!remoteRefCheck) {
      throw new ConflictException(
        "원격 저장소가 비어있거나 브랜치가 없습니다. add -> commit -> push 작업을 먼저 진행해주세요.",
      );
    }

    await git.fetch(remote, targetBranch);

    const localHash = (await git.revparse(["HEAD"])).trim();
    const remoteHash = (await git.revparse([`${remote}/${targetBranch}`])).trim();

    if (localHash === remoteHash) {
      throw new HttpException("", HttpStatus.NO_CONTENT);
    }

    const isAncestor = await git
      .raw(["merge-base", "--is-ancestor", localHash, remoteHash])
      .then(() => true)
      .catch(() => false);

    if (ffOnly && !isAncestor) {
      throw new ConflictException("Fast-forward not possible");
    }

    try {
      await git.pull(remote, targetBranch, ffOnly ? { "--ff-only": null } : {});
    } catch (err) {
      if (/merge conflict/i.test(err.message)) {
        throw new ConflictException("Merge conflict");
      }
      throw new InternalServerErrorException(err.message);
    }

    return {
      success: true,
      fastForward: isAncestor,
      from: localHash,
      to: remoteHash,
    };
  }

  async addRemote(
    repoId: string,
    userId: string,
    url: string,
    name = "origin",
  ) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);
    const remotes = await git.getRemotes(true);
    if (remotes.find((r) => r.name === name)) {
      await git.remote(["set-url", name, url]);
    } else {
      await git.addRemote(name, url);
    }
  }

  async status(repoId: string, userId: string) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);
    const st = await git.status();

    return [
      ...st.modified.map((f) => ({ name: f, status: "modified" })),
      ...st.not_added.map((f) => ({ name: f, status: "untracked" })),
      ...st.created.map((f) => ({ name: f, status: "added" })),
      ...st.deleted.map((f) => ({ name: f, status: "deleted" })),
      ...st.renamed.map((r) => ({ name: r.to, status: "renamed" })),
    ];
  }

  async addFilesToRepo(repoId: string, userId: string, files?: string[]) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);
    const addTarget = files?.length ? files : ".";
    await git.add(addTarget);

    const status = await git.status();
    return { success: true, stagedFiles: status.staged || [] };
  }

  async commitToRepo(
    repoId: string,
    userId: string,
    message: string,
    branch?: string,
  ) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);

    if (branch) {
      const current = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
      if (current !== branch) {
        await git.checkout(["-B", branch]);
      }
    }

    const commitResult = await git.commit(message, undefined, {
      "--no-gpg-sign": null,
    });
    const [{ hash, message: msg, date }] = (await git.log({ maxCount: 1 })).all;

    return {
      success: true,
      commitHash: hash,
      message: msg,
      committedAt: date,
      stats: commitResult.summary,
    };
  }

  async pushRepo(
    repoId: string,
    userId: string,
    remote = "origin",
    branch?: string,
  ) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);
    
    const targetBranch = branch || (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

    let remoteExists = true;
    try {
      await git.raw(["rev-parse", "--verify", `${remote}/${targetBranch}`]);
    } catch {
      remoteExists = false;
    }

    let ahead = 0;
    if (remoteExists) {
      const [, a] = (
        await git.raw([
          "rev-list",
          "--left-right",
          "--count",
          `${remote}/${targetBranch}...HEAD`,
        ])
      )
        .trim()
        .split("\t")
        .map(Number);
      ahead = a;
    }

    if (remoteExists && ahead === 0) {
      return { success: true, upToDate: true, pushed: [] };
    }

    const res = await git.push(remote, targetBranch);

    return {
      success: true,
      upToDate: false,
      pushed: res.pushed,
    };
  }

  async getBranches(repoId: string, userId: string, limit = 20) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);

    const branchRes = await git.branchLocal();
    const branches = await Promise.all(
      branchRes.all.map(async (branchName) => {
        const logRes = await git.log<DefaultLogFields>([
          branchName,
          `--max-count=${limit}`,
          "--reverse",
        ]);
        const commits = logRes.all.map((c) => ({
          hash: c.hash.slice(0, 7),
          message: c.message,
          author: c.author_name,
          committedAt: c.date,
        }));
        return {
          name: branchName,
          pushedCommits: commits,
        };
      }),
    );
    return { branches };
  }

  async getGraph(repoId: string, userId: string, since?: string, max = 200) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);

    const branchInfo = await git.branch(["-a"]);
    const branches: Record<string, string> = {};
    for (const [name, obj] of Object.entries(branchInfo.branches) as [
      string,
      BranchSummaryBranch,
    ][]) {
      if (!name.startsWith("remotes/")) branches[name] = obj.commit;
    }

    const pretty = "%H|%P|%an|%ai|%s";
    const args: string[] = [
      "--all",
      "--reverse",
      `--max-count=${max}`,
      `--pretty=${pretty}`,
    ];
    if (since) args.push(`^${since}`);

    const raw = await git.raw(["log", ...args]);
    const commits = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, parents, author, iso, msg] = line.split("|");
        return {
          hash,
          parents: parents ? parents.split(" ") : [],
          author,
          committedAt: iso,
          message: msg,
        };
      });

    return { branches, commits };
  }

  async createLocalRemote(repoId: string, userId: string, name = "origin") {
    const { git: localGit } = await this._getRepoAndGitInstance(repoId, userId);

    const remoteRepoPath = path.join(this.remoteBasePath, `${repoId}.git`);

    try {
      await fs.access(remoteRepoPath);
    } catch {
      await fs.mkdir(remoteRepoPath, { recursive: true });
      const bareGit = simpleGit(remoteRepoPath);
      await bareGit.init(true);
    }

    const remotes = await localGit.getRemotes(true);
    const existing = remotes.find((r) => r.name === name);

    if (existing) {
      await localGit.remote(["set-url", name, remoteRepoPath]);
    } else {
      await localGit.addRemote(name, remoteRepoPath);
    }

    return { name, path: remoteRepoPath };
  }

  async createBranch(
    repoId: string,
    userId: string,
    newBranchName: string,
    baseBranchName?: string,
  ) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);
    const options = baseBranchName ? [baseBranchName] : [];
    await git.checkout(["-b", newBranchName, ...options]);
    return { success: true, message: `Branch '${newBranchName}' created.` };
  }

  async switchBranch(repoId: string, userId: string, branchName: string) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);
    await git.checkout(branchName);
    const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]);
    return { success: true, currentBranch };
  }

  async deleteBranch(repoId: string, userId: string, branchName: string) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);
    await git.deleteLocalBranch(branchName, true);
    return { success: true, message: `Branch '${branchName}' deleted.` };
  }

  async mergeBranch(
    repoId: string,
    userId: string,
    sourceBranch: string,
    targetBranch?: string,
    fastForwardOnly = false,
  ) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);
    
    // 타겟 브랜치가 지정되지 않으면 현재 브랜치 사용
    const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    const finalTargetBranch = targetBranch || currentBranch;
    
    if (currentBranch !== finalTargetBranch) {
      await git.checkout(finalTargetBranch);
    }
    
    const beforeHash = (await git.revparse(["HEAD"])).trim();
    
    try {
      if (fastForwardOnly) {
        throw new ConflictException("Fast-forward merge is not allowed. Use 3-way merge only.");
      }
      
      await git.merge([sourceBranch, "--no-ff"]);
      
      const afterHash = (await git.revparse(["HEAD"])).trim();
      const fastForward = beforeHash !== afterHash;
      
      return {
        success: true,
        fastForward,
        from: beforeHash,
        to: afterHash,
        sourceBranch,
        targetBranch: finalTargetBranch,
      };
    } catch (err) {
      if (/merge conflict/i.test(err.message)) {
        throw new ConflictException("Merge conflict detected. Please resolve conflicts manually.");
      }
      if (/fast-forward/i.test(err.message)) {
        throw new ConflictException("Fast-forward merge not possible");
      }
      throw new InternalServerErrorException(`Merge failed: ${err.message}`);
    }
  }

  async createPullRequest(
    repoId: string,
    userId: string,
    createPullRequestDto: CreatePullRequestDto,
  ) {
    const { git } = await this._getRepoAndGitInstance(repoId, userId);
    
    const branches = await git.branchLocal();
    if (!branches.all.includes(createPullRequestDto.sourceBranch)) {
      throw new NotFoundException(`Source branch '${createPullRequestDto.sourceBranch}' not found`);
    }
    if (!branches.all.includes(createPullRequestDto.targetBranch)) {
      throw new NotFoundException(`Target branch '${createPullRequestDto.targetBranch}' not found`);
    }

    if (createPullRequestDto.sourceBranch === createPullRequestDto.targetBranch) {
      throw new ConflictException("Source and target branches cannot be the same");
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
      throw new ConflictException("A pull request already exists for these branches");
    }

    const pullRequest = this.pullRequestRepository.create({
      ...createPullRequestDto,
      repoId,
      authorId: userId,
      status: PullRequestStatus.OPEN,
    });

    return this.pullRequestRepository.save(pullRequest);
  }

  async getPullRequests(repoId: string, userId: string, status?: PullRequestStatus) {
    await this._getRepoAndGitInstance(repoId, userId);

    const whereCondition: { repoId: string; status?: PullRequestStatus } = { repoId };
    if (status) {
      whereCondition.status = status;
    }

    return this.pullRequestRepository.find({
      where: whereCondition,
      order: { createdAt: "DESC" },
    });
  }

  async getPullRequest(repoId: string, userId: string, prId: string) {
    await this._getRepoAndGitInstance(repoId, userId);

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

    // 승인 필수인 경우 승인 상태 확인
    if (pullRequest.requiresApproval) {
      const approvedReviews = await this.prReviewRepository.find({
        where: {
          pullRequestId: prId,
          status: ReviewStatus.APPROVED,
        },
      });

      if (approvedReviews.length === 0) {
        throw new ConflictException("Pull request requires at least one approval before merging");
      }
    }

    const mergeResult = await this.mergeBranch(
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

    // 자신이 생성한 PR에는 리뷰 불가
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
