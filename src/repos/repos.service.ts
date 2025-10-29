import { Injectable, InternalServerErrorException, NotFoundException, ForbiddenException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repo } from "@src/repos/entities/repo.entity";
import { PullRequest } from "@src/repos/entities/pull-request.entity";
import { PrReview } from "@src/repos/entities/pr-review.entity";
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
    @InjectRepository(PullRequest)
    private readonly pullRequestRepository: Repository<PullRequest>,
    @InjectRepository(PrReview)
    private readonly prReviewRepository: Repository<PrReview>,
    configService: ConfigService,
  ) {
    super(repoRepository, configService);
  }

  async createRepo(
    createRepoDto: CreateRepoDto,
    ownerId: string,
  ): Promise<RepoResponseDto> {
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

      const repo = await this.repoRepository.save(savedRepo);

      const repoWithOwner = await this.repoRepository.findOne({
        where: { repoId: repo.repoId },
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
    savedRepo.gitPath = path.join(this.repoBasePath, savedRepo.repoId);

    try {
      await this.ensureDirectoryExists(path.dirname(savedRepo.gitPath));
      const git = simpleGit();

      await git.clone(sourceRepo.gitPath, savedRepo.gitPath);

      const forkedGit = simpleGit(savedRepo.gitPath);
      await forkedGit.addConfig("commit.gpgsign", "false");

      const repo = await this.repoRepository.save(savedRepo);

      const repoWithOwner = await this.repoRepository.findOne({
        where: { repoId: repo.repoId },
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

      if (repo.gitPath) {
        try {
          await fs.rm(repo.gitPath, { recursive: true, force: true });
        } catch (error) {
          if (error.code !== "ENOENT") {
            throw error;
          }
        }
      }

      const env = this.configService.get<string>("ENV", "dev");
      const remotePathKey = env === "prod" ? "REMOTE_BASE_PATH" : "REMOTE_LOCAL_BASE_PATH";
      const remoteBasePath = this.configService.get<string>(remotePathKey, "data/remote");
      const remotePath = path.join(remoteBasePath, `${repoId}.git`);

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
