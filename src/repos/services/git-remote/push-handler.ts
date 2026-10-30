import { Logger } from "@nestjs/common";
import { SimpleGit } from "simple-git";
import {
  GitOperationException,
  GitPushRejectedException,
} from "@src/repos/exceptions/repo.exceptions";
import { PushResponse } from "@src/repos/dto/responses.dto";

export class PushHandler {
  private readonly logger = new Logger(PushHandler.name);

  async execute(
    git: SimpleGit,
    remote: string,
    branch: string | undefined,
    force: boolean | undefined,
    repoId: string,
  ): Promise<PushResponse> {
    const targetBranch = await this.getTargetBranch(git, branch);
    await this.validateRemote(git, remote);
    await this.validateLocalBranch(git, targetBranch);

    const { remoteExists, ahead } = await this.checkRemoteStatus(
      git,
      remote,
      targetBranch,
    );

    if (!force && remoteExists && ahead === 0) {
      return { success: true, upToDate: true, pushed: [] };
    }

    return await this.performPush(
      git,
      remote,
      targetBranch,
      force,
      ahead,
      repoId,
    );
  }

  private async getTargetBranch(
    git: SimpleGit,
    branch?: string,
  ): Promise<string> {
    if (branch) {
      return branch;
    }

    try {
      return (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    } catch (err) {
      throw new GitOperationException(
        "push",
        "현재 브랜치를 확인할 수 없습니다.",
      );
    }
  }

  private async validateRemote(git: SimpleGit, remote: string): Promise<void> {
    const remotes = await git.getRemotes();
    if (!remotes.find((r) => r.name === remote)) {
      throw new GitOperationException(
        "push",
        `리모트 '${remote}'가 설정되지 않았습니다.`,
      );
    }
  }

  private async validateLocalBranch(
    git: SimpleGit,
    targetBranch: string,
  ): Promise<void> {
    try {
      await git.raw(["rev-parse", "--verify", targetBranch]);
    } catch {
      throw new GitOperationException(
        "push",
        `브랜치 '${targetBranch}'를 찾을 수 없습니다.`,
      );
    }
  }

  private async checkRemoteStatus(
    git: SimpleGit,
    remote: string,
    targetBranch: string,
  ): Promise<{ remoteExists: boolean; ahead: number }> {
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

    return { remoteExists, ahead };
  }

  private async performPush(
    git: SimpleGit,
    remote: string,
    targetBranch: string,
    force: boolean | undefined,
    ahead: number,
    repoId: string,
  ): Promise<PushResponse> {
    try {
      this.logger.debug(
        `Push 시작: repoId=${repoId}, remote=${remote}, branch=${targetBranch}, ahead=${ahead}, force=${force} ${force ? "⚠️ Force Push 수행" : "🚀 실제로 Push를 수행합니다"}`,
      );

      const pushOptions = force ? ["--force"] : [];
      const res = await git.push(remote, targetBranch, pushOptions);

      this.logger.debug(
        `Push 성공: repoId=${repoId}, remote=${remote}, branch=${targetBranch}, pushed=${JSON.stringify(res.pushed)}`,
      );

      return {
        success: true,
        upToDate: false,
        pushed: res.pushed,
      };
    } catch (err) {
      return await this.handlePushError(git, remote, targetBranch, err);
    }
  }

  private async handlePushError(
    git: SimpleGit,
    remote: string,
    targetBranch: string,
    err: any,
  ): Promise<PushResponse> {
    const errorMessage = err.message || err.toString();

    if (/no upstream branch|set-upstream/i.test(errorMessage)) {
      return await this.retryWithUpstream(git, remote, targetBranch);
    }

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

    if (/authentication|permission|unauthorized/i.test(errorMessage)) {
      throw new GitOperationException("push", `인증 실패: ${errorMessage}`);
    }

    throw new GitOperationException("push", errorMessage);
  }

  private async retryWithUpstream(
    git: SimpleGit,
    remote: string,
    targetBranch: string,
  ): Promise<PushResponse> {
    try {
      const res = await git.push(remote, targetBranch, ["--set-upstream"]);
      return {
        success: true,
        upToDate: false,
        pushed: res.pushed,
      };
    } catch (retryErr) {
      const retryErrorMessage = retryErr.message || retryErr.toString();

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
}
