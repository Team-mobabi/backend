import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Repo } from "@src/repos/entities/repo.entity";
import { RepoCollaborator } from "@src/repos/entities/repo-collaborator.entity";
import { ConfigService } from "@nestjs/config";
import { BaseRepoService } from "@src/repos/services/base-repo.service";
import * as simpleGit from "simple-git";
import {
  MergeConflictException,
  GitPullConflictException,
  GitPushRejectedException,
  GitUncommittedChangesException,
  GitStashConflictException,
} from "@src/repos/exceptions/repo.exceptions";

export interface ConflictInfo {
  hasConflict: boolean;
  conflictFiles: string[];
  message?: string;
}

interface StashInfo {
  stashId: string;
  message: string;
}

@Injectable()
export class GitConflictService extends BaseRepoService {
  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    @InjectRepository(RepoCollaborator)
    collaboratorRepository: Repository<RepoCollaborator>,
    configService: ConfigService,
  ) {
    super(repoRepository, collaboratorRepository, configService);
  }

  /**
   * Git 상태를 확인하여 충돌 파일을 찾습니다
   */
  async checkForConflicts(repoId: string, userId: string): Promise<ConflictInfo> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const status = await git.status();
      const conflictFiles = status.conflicted;

      return {
        hasConflict: conflictFiles.length > 0,
        conflictFiles,
        message: conflictFiles.length > 0
          ? `${conflictFiles.length}개 파일에서 충돌이 발생했습니다`
          : undefined,
      };
    } catch (error) {
      throw new Error(`충돌 확인 실패: ${error.message}`);
    }
  }

  /**
   * 로컬 변경사항이 있는지 확인합니다
   */
  async checkUncommittedChanges(repoId: string, userId: string): Promise<string[]> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    const status = await git.status();
    const changes = [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map(r => r.to),
    ];

    return changes;
  }

  /**
   * 안전한 Pull을 수행합니다 (충돌 처리 포함)
   * 충돌이 발생해도 예외를 던지지 않고 응답에 충돌 정보를 포함합니다
   */
  async safePull(
    repoId: string,
    userId: string,
    remote = "origin",
    branch?: string,
  ): Promise<{
    success: boolean;
    hasConflict: boolean;
    conflictFiles: string[];
    message: string;
  }> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    // 1. 로컬 변경사항 확인
    const uncommittedChanges = await this.checkUncommittedChanges(repoId, userId);
    if (uncommittedChanges.length > 0) {
      const stashResult = await this.autoStash(repoId, userId);

      try {
        await git.pull(remote, branch);

        if (stashResult) {
          await this.applyStash(repoId, userId, stashResult.stashId);
        }

        const conflictInfo = await this.checkForConflicts(repoId, userId);

        return {
          success: true,
          hasConflict: conflictInfo.hasConflict,
          conflictFiles: conflictInfo.conflictFiles,
          message: conflictInfo.hasConflict
            ? "Pull 성공 (로컬 변경사항 자동 저장 및 복원, 충돌 발생)"
            : "Pull 성공 (로컬 변경사항 자동 저장 및 복원)"
        };
      } catch (error) {
        if (stashResult) {
          try {
            await this.applyStash(repoId, userId, stashResult.stashId);
          } catch (stashError) {
            const conflictFiles = await this.getConflictFiles(git);
            throw new GitStashConflictException(conflictFiles);
          }
        }

        if (!/merge conflict|CONFLICT/i.test(error.message)) {
          throw error;
        }

        const conflictInfo = await this.checkForConflicts(repoId, userId);
        return {
          success: true,
          hasConflict: true,
          conflictFiles: conflictInfo.conflictFiles,
          message: "Pull 중 충돌이 발생했습니다"
        };
      }
    }

    try {
      await git.pull(remote, branch);

      const conflictInfo = await this.checkForConflicts(repoId, userId);

      return {
        success: true,
        hasConflict: conflictInfo.hasConflict,
        conflictFiles: conflictInfo.conflictFiles,
        message: conflictInfo.hasConflict ? "Pull 중 충돌이 발생했습니다" : "Pull 성공"
      };
    } catch (error) {
      if (!/merge conflict|CONFLICT/i.test(error.message)) {
        throw error;
      }

      const conflictInfo = await this.checkForConflicts(repoId, userId);
      return {
        success: true,
        hasConflict: true,
        conflictFiles: conflictInfo.conflictFiles,
        message: "Pull 중 충돌이 발생했습니다"
      };
    }
  }

  /**
   * 안전한 Push를 수행합니다
   */
  async safePush(
    repoId: string,
    userId: string,
    remote = "origin",
    branch?: string,
    force = false,
  ): Promise<{ success: boolean; message: string }> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      if (force) {
        await git.push(remote, branch, ["--force"]);
        return { success: true, message: "Force push 성공" };
      } else {
        await git.push(remote, branch);
        return { success: true, message: "Push 성공" };
      }
    } catch (error) {
      const errorMessage = error.message || error.toString();

      if (errorMessage.includes("rejected") || errorMessage.includes("non-fast-forward")) {
        throw new GitPushRejectedException({
          reason: errorMessage.includes("non-fast-forward")
            ? "non-fast-forward"
            : "rejected",
          hint: "원격 저장소에 로컬에 없는 변경사항이 있습니다",
        });
      }

      throw error;
    }
  }

  /**
   * 안전한 Merge를 수행합니다
   * 충돌이 발생해도 예외를 던지지 않고 응답에 충돌 정보를 포함합니다
   */
  async safeMerge(
    repoId: string,
    userId: string,
    sourceBranch: string,
    targetBranch?: string,
    fastForwardOnly = false,
  ): Promise<{
    success: boolean;
    hasConflict: boolean;
    conflictFiles: string[];
    message: string;
  }> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    const status = await git.status();
    const currentBranch = status.current;

    if (targetBranch && targetBranch !== currentBranch) {
      await git.checkout(targetBranch);
    }

    try {
      const options = fastForwardOnly ? ["--ff-only"] : [];
      await git.merge([sourceBranch, ...options]);

      // 충돌 확인
      const conflictInfo = await this.checkForConflicts(repoId, userId);

      return {
        success: true,
        hasConflict: conflictInfo.hasConflict,
        conflictFiles: conflictInfo.conflictFiles,
        message: conflictInfo.hasConflict
          ? `${sourceBranch}를 병합했으나 충돌이 발생했습니다`
          : `${sourceBranch}를 성공적으로 병합했습니다`
      };
    } catch (error) {
      if (!/merge conflict|CONFLICT/i.test(error.message)) {
        if (targetBranch && currentBranch && targetBranch !== currentBranch) {
          await git.checkout(currentBranch);
        }
        throw error;
      }

      const conflictInfo = await this.checkForConflicts(repoId, userId);
      return {
        success: true,
        hasConflict: true,
        conflictFiles: conflictInfo.conflictFiles,
        message: `${sourceBranch} 병합 중 충돌이 발생했습니다`
      };
    }
  }

  /**
   * 변경사항을 자동으로 Stash합니다
   */
  private async autoStash(repoId: string, userId: string): Promise<StashInfo | null> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    const timestamp = new Date().toISOString();
    const message = `Auto-stash before pull at ${timestamp}`;

    try {
      await git.stash(["push", "-m", message]);

      const stashList = await git.stashList();
      const latestStash = stashList.latest;

      if (latestStash) {
        return {
          stashId: latestStash.hash,
          message: latestStash.message,
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Stash를 적용합니다
   */
  private async applyStash(repoId: string, userId: string, stashId: string): Promise<void> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      await git.stash(["apply", stashId]);
    } catch (error) {
      const conflictFiles = await this.getConflictFiles(git);
      if (conflictFiles.length > 0) {
        throw new GitStashConflictException(conflictFiles);
      }
      throw error;
    }
  }

  /**
   * 충돌 파일 목록을 가져옵니다
   */
  private async getConflictFiles(git: simpleGit.SimpleGit): Promise<string[]> {
    const status = await git.status();
    return status.conflicted;
  }

  /**
   * 충돌을 해결합니다 (파일 내용 선택)
   */
  async resolveConflict(
    repoId: string,
    userId: string,
    filePath: string,
    resolution: "ours" | "theirs" | "manual",
    manualContent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const { git, repoPath } = await this.getRepoAndGit(repoId, userId);

    try {
      if (resolution === "ours") {
        await git.checkout(["--ours", filePath]);
        await git.add(filePath);
      } else if (resolution === "theirs") {
        await git.checkout(["--theirs", filePath]);
        await git.add(filePath);
      } else if (resolution === "manual" && manualContent !== undefined) {
        const fs = await import("fs/promises");
        const path = await import("path");
        const fullPath = path.join(repoPath, filePath);
        await fs.writeFile(fullPath, manualContent, "utf8");
        await git.add(filePath);
      }

      const conflictInfo = await this.checkForConflicts(repoId, userId);

      if (!conflictInfo.hasConflict) {
        return {
          success: true,
          message: "모든 충돌이 해결되었습니다. 이제 커밋할 수 있습니다."
        };
      } else {
        return {
          success: true,
          message: `파일 충돌이 해결되었습니다. 남은 충돌 파일: ${conflictInfo.conflictFiles.join(", ")}`
        };
      }
    } catch (error) {
      throw new Error(`충돌 해결 실패: ${error.message}`);
    }
  }

  /**
   * 병합을 중단합니다
   */
  async abortMerge(repoId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      await git.merge(["--abort"]);
      return { success: true, message: "병합이 취소되었습니다" };
    } catch (error) {
      throw new Error(`병합 취소 실패: ${error.message}`);
    }
  }

  /**
   * Rebase를 중단합니다
   */
  async abortRebase(repoId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      await git.rebase(["--abort"]);
      return { success: true, message: "Rebase가 취소되었습니다" };
    } catch (error) {
      throw new Error(`Rebase 취소 실패: ${error.message}`);
    }
  }
}