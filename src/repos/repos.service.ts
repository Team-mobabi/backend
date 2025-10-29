import { Injectable, InternalServerErrorException, NotFoundException, ForbiddenException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repo } from "@src/repos/entities/repo.entity";
import { PullRequest } from "@src/repos/entities/pull-request.entity";
import { PrReview } from "@src/repos/entities/pr-review.entity";
import { RepoCollaborator } from "@src/repos/entities/repo-collaborator.entity";
import { CreateRepoDto } from "@src/repos/dto/create-repo.dto";
import { ForkRepoDto } from "@src/repos/dto/fork-repo.dto";
import { RepoResponseDto, RepoOwnerDto } from "@src/repos/dto/repo-response.dto";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import simpleGit from "simple-git";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { BaseRepoService } from "@src/repos/services/base-repo.service";

@Injectable()
export class ReposService extends BaseRepoService {
  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    @InjectRepository(RepoCollaborator)
    collaboratorRepository: Repository<RepoCollaborator>,
    @InjectRepository(PullRequest)
    private readonly pullRequestRepository: Repository<PullRequest>,
    @InjectRepository(PrReview)
    private readonly prReviewRepository: Repository<PrReview>,
    configService: ConfigService,
  ) {
    super(repoRepository, collaboratorRepository, configService);
  }

  async createRepo(
    createRepoDto: CreateRepoDto,
    ownerId: string,
  ): Promise<RepoResponseDto> {
    const newRepo = this.repoRepository.create({ ...createRepoDto, ownerId });
    const savedRepo = await this.repoRepository.save(newRepo);

    try {
      const remotePath = path.join(this.remoteBasePath, `${savedRepo.repoId}.git`);
      const ownerRepoPath = path.join(this.repoBasePath, ownerId, savedRepo.repoId);

      await this.ensureDirectoryExists(remotePath);
      const remoteGit = simpleGit(remotePath);
      await remoteGit.init(true, { "--initial-branch": "main" });

      await this.ensureDirectoryExists(ownerRepoPath);
      const git = simpleGit(ownerRepoPath);

      await git.init(false, { "--initial-branch": "main" });
      await git.addConfig("commit.gpgsign", "false");

      await git.addRemote("origin", remotePath);

      await git.commit("Initial commit", undefined, {
        "--allow-empty": null,
        "--no-gpg-sign": null,
      });

      const repoWithOwner = await this.repoRepository.findOne({
        where: { repoId: savedRepo.repoId },
        relations: ["owner"],
      });

      if (!repoWithOwner) {
        throw new InternalServerErrorException("Failed to retrieve created repository");
      }

      return this.toRepoResponseDto(repoWithOwner);
    } catch (error) {
      await this.repoRepository.delete(savedRepo.repoId);
      throw new InternalServerErrorException(
        `Failed to initialize repository: ${error.message}`,
      );
    }
  }

  async findReposByOwner(userId: string): Promise<RepoResponseDto[]> {
    const repos = await this.repoRepository.find({
      where: { ownerId: userId },
      relations: ["owner"],
      order: { createdAt: "DESC" },
    });

    return repos.map(repo => this.toRepoResponseDto(repo));
  }

  async findReposByUserAccess(userId: string): Promise<RepoResponseDto[]> {
    const ownedRepos = await this.repoRepository.find({
      where: { ownerId: userId },
      relations: ["owner"],
    });

    const collaborations = await this.collaboratorRepository.find({
      where: { userId },
      relations: ["repo", "repo.owner"],
    });

    const collaboratorRepos = collaborations.map(c => c.repo);

    const allRepos = [...ownedRepos];
    const ownedRepoIds = new Set(ownedRepos.map(r => r.repoId));

    for (const repo of collaboratorRepos) {
      if (!ownedRepoIds.has(repo.repoId)) {
        allRepos.push(repo);
      }
    }

    allRepos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return allRepos.map(repo => this.toRepoResponseDto(repo));
  }

  private toRepoResponseDto(repo: Repo): RepoResponseDto {
    const dto: RepoResponseDto = {
      repoId: repo.repoId,
      ownerId: repo.ownerId,
      name: repo.name,
      description: repo.description,
      isPrivate: repo.isPrivate,
      forkedFrom: repo.forkedFrom,
      createdAt: repo.createdAt,
    };

    if (repo.owner) {
      dto.owner = {
        id: repo.owner.id,
        email: repo.owner.email,
      };
    }

    return dto;
  }

  async findPublicRepos(): Promise<RepoResponseDto[]> {
    const repos = await this.repoRepository.find({
      where: { isPrivate: false },
      relations: ["owner"],
      order: { createdAt: "DESC" },
    });

    return repos.map(repo => this.toRepoResponseDto(repo));
  }

  async findPublicReposByOwner(ownerId: string): Promise<RepoResponseDto[]> {
    const repos = await this.repoRepository.find({
      where: { ownerId, isPrivate: false },
      relations: ["owner"],
      order: { createdAt: "DESC" },
    });

    return repos.map(repo => this.toRepoResponseDto(repo));
  }

  async forkRepo(
    forkRepoDto: ForkRepoDto,
    userId: string,
  ): Promise<RepoResponseDto> {
    const { sourceRepoId, name, isPrivate = false } = forkRepoDto;

    const sourceRepo = await this.repoRepository.findOne({
      where: { repoId: sourceRepoId },
    });

    if (!sourceRepo) {
      throw new NotFoundException("원본 레포지토리를 찾을 수 없습니다.");
    }

    if (sourceRepo.isPrivate && sourceRepo.ownerId !== userId) {
      throw new ForbiddenException("비공개 레포지토리는 Fork할 수 없습니다.");
    }

    const newRepo = this.repoRepository.create({
      name: name || sourceRepo.name,
      description: sourceRepo.description,
      isPrivate,
      ownerId: userId,
      forkedFrom: sourceRepoId,
    });

    const savedRepo = await this.repoRepository.save(newRepo);

    try {
      const sourceRemotePath = path.join(this.remoteBasePath, `${sourceRepoId}.git`);
      const forkedRemotePath = path.join(this.remoteBasePath, `${savedRepo.repoId}.git`);
      const forkedUserRepoPath = path.join(this.repoBasePath, userId, savedRepo.repoId);

      await this.ensureDirectoryExists(path.dirname(forkedRemotePath));
      const git = simpleGit();
      await git.clone(sourceRemotePath, forkedRemotePath, ['--mirror']);

      await this.ensureDirectoryExists(path.dirname(forkedUserRepoPath));
      await git.clone(forkedRemotePath, forkedUserRepoPath);

      const forkedGit = simpleGit(forkedUserRepoPath);
      await forkedGit.addConfig("commit.gpgsign", "false");

      const branches = await forkedGit.branch(['-r']);
      const currentBranch = (await forkedGit.revparse(['--abbrev-ref', 'HEAD'])).trim();

      for (const remoteBranch of Object.keys(branches.branches)) {
        if (remoteBranch.includes('origin/') && !remoteBranch.includes('HEAD')) {
          const localBranchName = remoteBranch.replace('origin/', '');

          if (localBranchName !== currentBranch) {
            try {
              await forkedGit.checkout(['-b', localBranchName, remoteBranch]);
            } catch (err) {
              console.warn(`Failed to create local branch ${localBranchName}: ${err.message}`);
            }
          }
        }
      }

      await forkedGit.checkout(currentBranch);

      const repoWithOwner = await this.repoRepository.findOne({
        where: { repoId: savedRepo.repoId },
        relations: ["owner"],
      });

      if (!repoWithOwner) {
        throw new InternalServerErrorException("Failed to retrieve created repository");
      }

      return this.toRepoResponseDto(repoWithOwner);
    } catch (error) {
      await this.repoRepository.delete(savedRepo.repoId);
      throw new InternalServerErrorException(
        `Failed to fork repository: ${error.message}`,
      );
    }
  }

  async deleteRepo(repoId: string, userId: string): Promise<void> {
    const repo = await this.repoRepository.findOne({
      where: { repoId },
    });

    if (!repo) {
      throw new NotFoundException("레포지토리를 찾을 수 없습니다.");
    }

    if (repo.ownerId !== userId) {
      throw new ForbiddenException("레포지토리를 삭제할 권한이 없습니다.");
    }

    try {
      const pullRequests = await this.pullRequestRepository.find({
        where: { repoId },
      });

      for (const pr of pullRequests) {
        await this.prReviewRepository.delete({ pullRequestId: pr.id });
      }

      await this.pullRequestRepository.delete({ repoId });

      const collaborators = await this.collaboratorRepository.find({
        where: { repoId },
      });
      const allUserIds = [repo.ownerId, ...collaborators.map(c => c.userId)];

      for (const uid of allUserIds) {
        const userRepoPath = path.join(this.repoBasePath, uid, repoId);
        try {
          await fs.rm(userRepoPath, { recursive: true, force: true });
        } catch (error) {
          if (error.code !== "ENOENT") {
            console.warn(`Failed to delete user repo path ${userRepoPath}: ${error.message}`);
          }
        }
      }

      const remotePath = path.join(this.remoteBasePath, `${repoId}.git`);
      try {
        await fs.rm(remotePath, { recursive: true, force: true });
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }

      await this.repoRepository.delete(repoId);
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to delete repository: ${error.message}`,
      );
    }
  }
}
