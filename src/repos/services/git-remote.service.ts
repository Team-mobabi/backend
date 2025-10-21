import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import simpleGit from "simple-git";
import { Repo } from "@src/repos/entities/repo.entity";
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

@Injectable()
export class GitRemoteService extends BaseRepoService {
  private readonly remoteBasePath: string;

  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    configService: ConfigService,
  ) {
    super(repoRepository, configService);
    const env = this.configService.get<string>("ENV", "dev");
    const pathKey = env === "prod" ? "REMOTE_BASE_PATH" : "REMOTE_LOCAL_BASE_PATH";
    this.remoteBasePath = this.configService.get<string>(pathKey, "data/remote");
  }

  async pullRepo(
    repoId: string,
    userId: string,
    remote = "origin",
    branch?: string,
    ffOnly = false,
  ): Promise<PullResponse> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    // 로컬 변경사항 확인
    const status = await git.status();
    const hasUncommittedChanges =
      status.modified.length > 0 ||
      status.created.length > 0 ||
      status.deleted.length > 0;

    if (hasUncommittedChanges) {
      const changes = [
        ...status.modified,
        ...status.created,
        ...status.deleted,
      ];
      throw new GitUncommittedChangesException(changes);
    }

    // 브랜치 이름 가져오기 (에러 처리 추가)
    let targetBranch: string;
    if (branch) {
      targetBranch = branch;
    } else {
      try {
        targetBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
      } catch (err) {
        throw new GitOperationException(
          "pull",
          "현재 브랜치를 확인할 수 없습니다.",
        );
      }
    }

    // 리모트 존재 여부 확인
    const remotes = await git.getRemotes();
    if (!remotes.find((r) => r.name === remote)) {
      throw new GitOperationException(
        "pull",
        `리모트 '${remote}'가 설정되지 않았습니다.`,
      );
    }

    // 리모트 브랜치 존재 여부 확인
    let remoteRefCheck: string;
    try {
      remoteRefCheck = await git.raw([
        "ls-remote",
        "--heads",
        remote,
        targetBranch,
      ]);
    } catch (err) {
      throw new GitOperationException(
        "pull",
        `리모트 '${remote}'에 접근할 수 없습니다: ${err.message}`,
      );
    }

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
      // 충돌 에러는 정상 플로우로 처리 (merge와 동일)
      if (!/merge conflict|CONFLICT/i.test(err.message)) {
        // 로컬 변경사항과 충돌
        if (/would be overwritten|needs merge/i.test(err.message)) {
          const postStatus = await git.status();
          throw new GitPullConflictException({
            message: "로컬 변경사항과 충돌이 발생했습니다",
            localChanges: [...postStatus.modified, ...postStatus.created],
          });
        }

        throw new GitOperationException("pull", err.message);
      }
      // 충돌은 아래에서 체크하여 응답에 포함
    }

    // Pull 후 충돌 확인
    const postStatus = await git.status();
    const conflictFiles = postStatus.conflicted || [];
    const hasConflict = conflictFiles.length > 0;

    // Pull 후 최신 해시 가져오기
    const finalHash = (await git.revparse(["HEAD"])).trim();

    return {
      success: true,
      fastForward: isAncestor,
      from: localHash,
      to: finalHash,
      hasConflict,
      conflictFiles,
    };
  }

  async pushRepo(
    repoId: string,
    userId: string,
    remote = "origin",
    branch?: string,
  ) {
    const { git } = await this.getRepoAndGit(repoId, userId);

    // 브랜치 이름 가져오기 (에러 처리 추가)
    let targetBranch: string;
    if (branch) {
      targetBranch = branch;
    } else {
      try {
        targetBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
      } catch (err) {
        throw new GitOperationException(
          "push",
          "현재 브랜치를 확인할 수 없습니다.",
        );
      }
    }

    // 리모트 존재 여부 확인
    const remotes = await git.getRemotes();
    if (!remotes.find((r) => r.name === remote)) {
      throw new GitOperationException(
        "push",
        `리모트 '${remote}'가 설정되지 않았습니다.`,
      );
    }

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

    // push 실행 (upstream 미설정 에러 처리)
    try {
      const res = await git.push(remote, targetBranch);
      return {
        success: true,
        upToDate: false,
        pushed: res.pushed,
      };
    } catch (err) {
      const errorMessage = err.message || err.toString();

      // upstream이 설정되지 않은 경우 자동으로 설정하고 재시도
      if (/no upstream branch|set-upstream/i.test(errorMessage)) {
        try {
          const res = await git.push(remote, targetBranch, ["--set-upstream"]);
          return {
            success: true,
            upToDate: false,
            pushed: res.pushed,
          };
        } catch (retryErr) {
          const retryErrorMessage = retryErr.message || retryErr.toString();

          // Push 거부 처리
          if (/rejected|non-fast-forward/i.test(retryErrorMessage)) {
            throw new GitPushRejectedException({
              reason: retryErrorMessage.includes("non-fast-forward")
                ? "non-fast-forward"
                : "rejected",
              hint: "원격 저장소에 로컬에 없는 변경사항이 있습니다",
            });
          }

          throw new GitOperationException(
            "push",
            `Push 실패: ${retryErrorMessage}`,
          );
        }
      }

      // Push 거부 처리
      if (/rejected|non-fast-forward/i.test(errorMessage)) {
        throw new GitPushRejectedException({
          reason: errorMessage.includes("non-fast-forward")
            ? "non-fast-forward"
            : "rejected",
          hint: errorMessage.includes("non-fast-forward")
            ? "원격 저장소를 먼저 pull한 후 다시 시도하세요"
            : "원격 저장소 권한을 확인하세요",
        });
      }

      // 인증 실패
      if (/authentication|permission|unauthorized/i.test(errorMessage)) {
        throw new GitOperationException(
          "push",
          `인증 실패: ${errorMessage}`,
        );
      }

      throw new GitOperationException("push", errorMessage);
    }
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