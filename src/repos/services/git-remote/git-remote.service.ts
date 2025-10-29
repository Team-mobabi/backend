import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import simpleGit from "simple-git";
import { Repo } from "@src/repos/entities/repo.entity";
import { RepoCollaborator } from "@src/repos/entities/repo-collaborator.entity";
import { BaseRepoService } from "@src/repos/services/base-repo.service";
import { PullResponse } from "@src/repos/dto/responses.dto";
import {
  RemoteEmptyException,
  FastForwardNotPossibleException,
  MergeConflictException,
  GitOperationException,
  GitPullConflictException,
  GitPushRejectedException,
  GitUncommittedChangesException,
} from "@src/repos/exceptions/repo.exceptions";
import { PullHandler } from "./pull-handler";
import { PushHandler } from "./push-handler";

@Injectable()
export class GitRemoteService extends BaseRepoService {
  private readonly logger = new Logger(GitRemoteService.name);
  private readonly pullHandler = new PullHandler();
  private readonly pushHandler = new PushHandler();

  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    @InjectRepository(RepoCollaborator)
    collaboratorRepository: Repository<RepoCollaborator>,
    configService: ConfigService,
  ) {
    super(repoRepository, collaboratorRepository, configService);
  }

  async pullRepo(
    repoId: string,
    userId: string,
    remote = "origin",
    branch?: string,
    ffOnly = false,
  ): Promise<PullResponse> {
    const { git } = await this.getRepoAndGit(repoId, userId);
    return await this.pullHandler.execute(git, remote, branch, ffOnly);
  }

  async pushRepo(
    repoId: string,
    userId: string,
    remote = "origin",
    branch?: string,
    force?: boolean,
  ) {
    const { git } = await this.getRepoAndGit(repoId, userId);
    return await this.pushHandler.execute(git, remote, branch, force, repoId);
  }

  async addRemote(
    repoId: string,
    userId: string,
    url: string,
    name = "origin",
  ) {
    const { git } = await this.getRepoAndGit(repoId, userId);
    const remotes = await git.getRemotes(true);
    if (remotes.find((r) => r.name === name)) {
      await git.remote(["set-url", name, url]);
    } else {
      await git.addRemote(name, url);
    }
  }

  async createLocalRemote(repoId: string, userId: string, name = "origin") {
    const { git: localGit } = await this.getRepoAndGit(repoId, userId);

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
}