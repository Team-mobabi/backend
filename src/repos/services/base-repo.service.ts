import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import * as path from "node:path";
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
  protected readonly remoteBasePath: string;

  constructor(
    @InjectRepository(Repo)
    protected readonly repoRepository: Repository<Repo>,
    @InjectRepository(RepoCollaborator)
    protected readonly collaboratorRepository: Repository<RepoCollaborator>,
    protected readonly configService: ConfigService,
  ) {
    const env = this.configService.get<string>("ENV", "dev");
    const pathKey = env === "prod" ? "REPO_BASE_PATH" : "REPO_LOCAL_BASE_PATH";
    this.repoBasePath = this.configService.get<string>(pathKey, "data/repos");

    const remotePathKey = env === "prod" ? "REMOTE_BASE_PATH" : "REMOTE_LOCAL_BASE_PATH";
    this.remoteBasePath = this.configService.get<string>(remotePathKey, "data/remote");
  }

  protected async getRepoAndGit(
    repoId: string,
    userId: string,
    requiredRole: CollaboratorRole = CollaboratorRole.READ,
  ): Promise<{ repo: Repo; git: SimpleGit; repoPath: string }> {
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

    const userRepoPath = path.join(this.repoBasePath, userId, repoId);
    const remotePath = path.join(this.remoteBasePath, `${repoId}.git`);

    try {
      await fs.access(userRepoPath);
    } catch {
      await this.ensureDirectoryExists(path.dirname(userRepoPath));
      const git = simpleGit();
      await git.clone(remotePath, userRepoPath);

      const userGit = simpleGit(userRepoPath);
      await userGit.addConfig("commit.gpgsign", "false");
    }

    const git = simpleGit(userRepoPath);
    return { repo, git, repoPath: userRepoPath };
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
