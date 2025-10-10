import { Injectable, InternalServerErrorException, NotFoundException, ForbiddenException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repo } from "@src/repos/entities/repo.entity";
import { CreateRepoDto } from "@src/repos/dto/create-repo.dto";
import { ForkRepoDto } from "@src/repos/dto/fork-repo.dto";
import * as path from "node:path";
import simpleGit from "simple-git";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { BaseRepoService } from "@src/repos/services/base-repo.service";

@Injectable()
export class ReposService extends BaseRepoService {
  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    configService: ConfigService,
  ) {
    super(repoRepository, configService);
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

  async findPublicRepos(): Promise<Repo[]> {
    return this.repoRepository.find({
      where: { isPrivate: false },
      order: { createdAt: "DESC" },
    });
  }

  async findPublicReposByOwner(ownerId: string): Promise<Repo[]> {
    return this.repoRepository.find({
      where: { ownerId, isPrivate: false },
      order: { createdAt: "DESC" },
    });
  }

  async forkRepo(
    forkRepoDto: ForkRepoDto,
    userId: string,
  ): Promise<Repo> {
    const { sourceRepoId, name, isPrivate = false } = forkRepoDto;

    // 원본 레포 조회
    const sourceRepo = await this.repoRepository.findOne({
      where: { repoId: sourceRepoId },
    });

    if (!sourceRepo) {
      throw new NotFoundException("원본 레포지토리를 찾을 수 없습니다.");
    }

    // 권한 확인: 공개 레포이거나 내가 소유자인 경우만 Fork 가능
    if (sourceRepo.isPrivate && sourceRepo.ownerId !== userId) {
      throw new ForbiddenException("비공개 레포지토리는 Fork할 수 없습니다.");
    }

    // 새 레포 생성
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
      // git clone으로 원본 레포 복사
      await this.ensureDirectoryExists(path.dirname(savedRepo.gitPath));
      const git = simpleGit();

      await git.clone(sourceRepo.gitPath, savedRepo.gitPath, ["--bare"]);

      // bare 레포를 일반 레포로 변환
      const forkedGit = simpleGit(savedRepo.gitPath);
      await forkedGit.raw(["config", "--bool", "core.bare", "false"]);
      await forkedGit.raw(["reset", "--hard"]);
      await forkedGit.addConfig("commit.gpgsign", "false");

      return this.repoRepository.save(savedRepo);
    } catch (error) {
      await this.repoRepository.delete(savedRepo.repoId);
      throw new InternalServerErrorException(
        `Failed to fork repository: ${error.message}`,
      );
    }
  }
}
