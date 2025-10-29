import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import simpleGit, { SimpleGit } from "simple-git";
import { Repo } from "@src/repos/entities/repo.entity";
import { RepoCollaborator, CollaboratorRole } from "@src/repos/entities/repo-collaborator.entity";
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
    @InjectRepository(RepoCollaborator)
    protected readonly collaboratorRepository: Repository<RepoCollaborator>,
    protected readonly configService: ConfigService,
  ) {
    const env = this.configService.get<string>("ENV", "dev");
    const pathKey = env === "prod" ? "REPO_BASE_PATH" : "REPO_LOCAL_BASE_PATH";
    this.repoBasePath = this.configService.get<string>(pathKey, "data/git");
  }

  protected async getRepoAndGit(
    repoId: string,
    userId: string,
    requiredRole: CollaboratorRole = CollaboratorRole.READ,
  ): Promise<{ repo: Repo; git: SimpleGit }> {
    const repo = await this.repoRepository.findOne({ where: { repoId } });
    if (!repo) {
      throw new RepoNotFoundException(repoId);
    }

    if (repo.ownerId !== userId) {
      const collaborator = await this.collaboratorRepository.findOne({
        where: { repoId, userId },
      });

      if (!collaborator) {
        throw new RepoAccessDeniedException(repoId);
      }

      if (!this.hasRequiredRole(collaborator.role, requiredRole)) {
        throw new RepoAccessDeniedException(repoId);
      }
    }

    if (!repo.gitPath) {
      throw new RepoPathNotConfiguredException(repoId);
    }

    await this.ensureDirectoryExists(repo.gitPath);
    const git = simpleGit(repo.gitPath);
    return { repo, git };
  }

  private hasRequiredRole(
    userRole: CollaboratorRole,
    requiredRole: CollaboratorRole,
  ): boolean {
    const roleHierarchy = {
      [CollaboratorRole.READ]: 1,
      [CollaboratorRole.WRITE]: 2,
      [CollaboratorRole.ADMIN]: 3,
    };

    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
  }

  protected async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (err) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }
}
