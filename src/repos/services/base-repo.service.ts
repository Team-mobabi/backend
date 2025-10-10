import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import simpleGit, { SimpleGit } from "simple-git";
import { Repo } from "@src/repos/entities/repo.entity";
import {
  RepoNotFoundException,
  RepoAccessDeniedException,
  RepoPathNotConfiguredException,
} from "@src/repos/exceptions/repo.exceptions";

@Injectable()
export abstract class BaseRepoService {
  protected readonly repoBasePath: string;

  constructor(
    @InjectRepository(Repo)
    protected readonly repoRepository: Repository<Repo>,
    protected readonly configService: ConfigService,
  ) {
    const env = this.configService.get<string>("ENV", "dev");
    const pathKey = env === "prod" ? "REPO_BASE_PATH" : "REPO_LOCAL_BASE_PATH";
    this.repoBasePath = this.configService.get<string>(pathKey, "data/git");
  }

  protected async getRepoAndGit(
    repoId: string,
    userId: string,
  ): Promise<{ repo: Repo; git: SimpleGit }> {
    const repo = await this.repoRepository.findOne({ where: { repoId } });
    if (!repo) {
      throw new RepoNotFoundException(repoId);
    }

    if (repo.ownerId !== userId) {
      throw new RepoAccessDeniedException(repoId);
    }

    if (!repo.gitPath) {
      throw new RepoPathNotConfiguredException(repoId);
    }

    await this.ensureDirectoryExists(repo.gitPath);
    const git = simpleGit(repo.gitPath);
    return { repo, git };
  }

  protected async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (err) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }
}
