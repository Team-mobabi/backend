import { HttpException, HttpStatus, Logger } from "@nestjs/common";
import { SimpleGit } from "simple-git";
import {
  GitUncommittedChangesException,
  GitOperationException,
  RemoteEmptyException,
  FastForwardNotPossibleException,
  GitPullConflictException,
} from "@src/repos/exceptions/repo.exceptions";
import { PullResponse } from "@src/repos/dto/responses.dto";

export class PullHandler {
  private readonly logger = new Logger(PullHandler.name);

  async execute(
    git: SimpleGit,
    remote: string,
    branch: string | undefined,
    ffOnly: boolean
  ): Promise<PullResponse> {
    await this.validateUncommittedChanges(git);
    const targetBranch = await this.getTargetBranch(git, branch);
    await this.validateRemote(git, remote, targetBranch);

    const { localHash, remoteHash } = await this.fetchAndGetHashes(git, remote, targetBranch);

    if (localHash === remoteHash) {
      throw new HttpException("", HttpStatus.NO_CONTENT);
    }

    const isAncestor = await this.checkIsAncestor(git, localHash, remoteHash);

    if (ffOnly && !isAncestor) {
      throw new FastForwardNotPossibleException();
    }

    await this.performPull(git, remote, targetBranch, ffOnly);

    return await this.buildResponse(git, localHash, isAncestor);
  }

  private async validateUncommittedChanges(git: SimpleGit): Promise<void> {
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
  }

  private async getTargetBranch(git: SimpleGit, branch?: string): Promise<string> {
    if (branch) {
      return branch;
    }

    try {
      return (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    } catch (err) {
      throw new GitOperationException(
        "pull",
        "현재 브랜치를 확인할 수 없습니다.",
      );
    }
  }

  private async validateRemote(git: SimpleGit, remote: string, targetBranch: string): Promise<void> {
    const remotes = await git.getRemotes();
    if (!remotes.find((r) => r.name === remote)) {
      throw new GitOperationException(
        "pull",
        `리모트 '${remote}'가 설정되지 않았습니다.`,
      );
    }

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
  }

  private async fetchAndGetHashes(
    git: SimpleGit,
    remote: string,
    targetBranch: string
  ): Promise<{ localHash: string; remoteHash: string }> {
    await git.fetch(remote, targetBranch);

    const localHash = (await git.revparse(["HEAD"])).trim();
    const remoteHash = (await git.revparse([`${remote}/${targetBranch}`])).trim();

    return { localHash, remoteHash };
  }

  private async checkIsAncestor(git: SimpleGit, localHash: string, remoteHash: string): Promise<boolean> {
    return await git
      .raw(["merge-base", "--is-ancestor", localHash, remoteHash])
      .then(() => true)
      .catch(() => false);
  }

  private async performPull(git: SimpleGit, remote: string, targetBranch: string, ffOnly: boolean): Promise<void> {
    try {
      await git.pull(remote, targetBranch, ffOnly ? { "--ff-only": null } : {});
    } catch (err) {
      if (!/merge conflict|CONFLICT/i.test(err.message)) {
        if (/would be overwritten|needs merge/i.test(err.message)) {
          const postStatus = await git.status();
          throw new GitPullConflictException({
            message: "로컬 변경사항과 충돌이 발생했습니다",
            localChanges: [...postStatus.modified, ...postStatus.created],
          });
        }

        throw new GitOperationException("pull", err.message);
      }
    }
  }

  private async buildResponse(git: SimpleGit, localHash: string, isAncestor: boolean): Promise<PullResponse> {
    const postStatus = await git.status();
    const conflictFiles = postStatus.conflicted || [];
    const hasConflict = conflictFiles.length > 0;
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
}