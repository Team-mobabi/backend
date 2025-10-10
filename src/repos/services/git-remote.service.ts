import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import simpleGit from "simple-git";
import { Repo } from "@src/repos/entities/repo.entity";
import { BaseRepoService } from "@src/repos/services/base-repo.service";
import {
  RemoteEmptyException,
  FastForwardNotPossibleException,
  MergeConflictException,
  GitOperationException,
} from "@src/repos/exceptions/repo.exceptions";

@Injectable()
export class GitRemoteService extends BaseRepoService {
  private readonly remoteBasePath: string;

  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    configService: ConfigService,
  ) {
    super(repoRepository, configService);
    this.remoteBasePath = this.configService.get<string>(
      "REMOTE_LOCAL_BASE_PATH",
      "data/remote",
    );
  }

  async pullRepo(
    repoId: string,
    userId: string,
    remote = "origin",
    branch?: string,
    ffOnly = false,
  ) {
    const { git } = await this.getRepoAndGit(repoId, userId);

    const targetBranch =
      branch || (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

    const remoteRefCheck = await git.raw([
      "ls-remote",
      "--heads",
      remote,
      targetBranch,
    ]);
    if (!remoteRefCheck) {
      throw new RemoteEmptyException();
    }

    await git.fetch(remote, targetBranch);

    const localHash = (await git.revparse(["HEAD"])).trim();
    const remoteHash = (
      await git.revparse([`${remote}/${targetBranch}`])
    ).trim();

    if (localHash === remoteHash) {
      throw new HttpException("", HttpStatus.NO_CONTENT);
    }

    const isAncestor = await git
      .raw(["merge-base", "--is-ancestor", localHash, remoteHash])
      .then(() => true)
      .catch(() => false);

    if (ffOnly && !isAncestor) {
      throw new FastForwardNotPossibleException();
    }

    try {
      await git.pull(remote, targetBranch, ffOnly ? { "--ff-only": null } : {});
    } catch (err) {
      if (/merge conflict/i.test(err.message)) {
        throw new MergeConflictException();
      }
      throw new GitOperationException("pull", err.message);
    }

    return {
      success: true,
      fastForward: isAncestor,
      from: localHash,
      to: remoteHash,
    };
  }

  async pushRepo(
    repoId: string,
    userId: string,
    remote = "origin",
    branch?: string,
    setUpstream = true,
  ) {
    const { git } = await this.getRepoAndGit(repoId, userId);

    const targetBranch =
      branch || (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

    // 로컬 브랜치가 존재하는지 확인
    try {
      await git.raw(["rev-parse", "--verify", targetBranch]);
    } catch {
      throw new GitOperationException(
        "push",
        `브랜치 '${targetBranch}'를 찾을 수 없습니다.`,
      );
    }

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

    // 처음 push하는 브랜치이고 setUpstream이 true면 --set-upstream 옵션 추가
    const pushOptions = (!remoteExists && setUpstream) ? ['--set-upstream'] : [];
    const res = await git.push(remote, targetBranch, pushOptions);

    return {
      success: true,
      upToDate: false,
      pushed: res.pushed,
    };
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