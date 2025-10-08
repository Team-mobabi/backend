import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repo } from "@src/repos/entities/repo.entity";
import { CreateRepoDto } from "@src/repos/dto/create-repo.dto";
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
}
