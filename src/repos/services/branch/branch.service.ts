import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import simpleGit, {
  BranchSummaryBranch,
  DefaultLogFields,
  SimpleGit,
} from "simple-git";
import { Repo } from "@src/repos/entities/repo.entity";
import { RepoCollaborator } from "@src/repos/entities/repo-collaborator.entity";
import { ConfigService } from "@nestjs/config";
import { BaseRepoService } from "@src/repos/services/base-repo.service";
import { MergeResponse } from "@src/repos/dto/responses.dto";
import { GitGraphBuilder } from "@src/repos/services/branch/git-graph-builder";

@Injectable()
export class BranchService extends BaseRepoService {
  private readonly logger = new Logger(BranchService.name);
  private readonly graphBuilder = new GitGraphBuilder();

  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    @InjectRepository(RepoCollaborator)
    collaboratorRepository: Repository<RepoCollaborator>,
    configService: ConfigService,
  ) {
    super(repoRepository, collaboratorRepository, configService);
  }

  async getBranches(repoId: string, userId: string, limit = 20) {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const branchRes = await git.branchLocal();
      const currentBranch = branchRes.current;

      const branches = await Promise.all(
        branchRes.all.map(async (branchName) => {
          const logRes = await git.log<DefaultLogFields>([
            branchName,
            `--max-count=${limit}`,
            "--reverse",
          ]);
          const commits = logRes.all.map((c) => ({
            hash: c.hash.slice(0, 7),
            message: c.message,
            author: c.author_name,
            committedAt: c.date,
          }));
          return {
            name: branchName,
            pushedCommits: commits,
            isCurrent: branchName === currentBranch,
          };
        }),
      );
      return { branches, currentBranch };
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to get branches: ${err.message}`,
      );
    }
  }

  async createBranch(
    repoId: string,
    userId: string,
    newBranchName: string,
    baseBranchName?: string,
  ) {
    const { git } = await this.getRepoAndGit(repoId, userId);
    try {
      const options = baseBranchName ? [baseBranchName] : [];
      await git.checkout(["-b", newBranchName, ...options]);

      const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]);
      const currentCommit = await git.revparse(["HEAD"]);

      return {
        success: true,
        message: `Branch '${newBranchName}' created.`,
        branchName: newBranchName,
        currentBranch: currentBranch.trim(),
        currentCommit: currentCommit.trim(),
        baseBranch: baseBranchName || null,
      };
    } catch (err) {
      if (/already exists/i.test(err.message)) {
        throw new ConflictException(
          `Branch '${newBranchName}' already exists.`,
        );
      }
      if (baseBranchName && /not a valid/i.test(err.message)) {
        throw new NotFoundException(
          `Base branch '${baseBranchName}' does not exist.`,
        );
      }
      throw new InternalServerErrorException(
        `Failed to create branch: ${err.message}`,
      );
    }
  }

  async switchBranch(repoId: string, userId: string, branchName: string) {
    const { git } = await this.getRepoAndGit(repoId, userId);
    try {
      await git.checkout(branchName);
      const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]);
      return { success: true, currentBranch };
    } catch (err) {
      if (/pathspec.*did not match/i.test(err.message)) {
        throw new NotFoundException(`Branch '${branchName}' does not exist.`);
      }
      if (/Please commit your changes/i.test(err.message)) {
        throw new ConflictException(
          "You have uncommitted changes. Please commit or stash them before switching branches.",
        );
      }
      throw new InternalServerErrorException(
        `Failed to switch branch: ${err.message}`,
      );
    }
  }

  async deleteBranch(repoId: string, userId: string, branchName: string) {
    const { git } = await this.getRepoAndGit(repoId, userId);
    try {
      await git.deleteLocalBranch(branchName, true);
      return { success: true, message: `Branch '${branchName}' deleted.` };
    } catch (err) {
      if (/not found/i.test(err.message)) {
        throw new NotFoundException(`Branch '${branchName}' does not exist.`);
      }
      if (/cannot delete.*checked out/i.test(err.message)) {
        throw new ConflictException(
          "Cannot delete the currently checked out branch. Please switch to another branch first.",
        );
      }
      throw new InternalServerErrorException(
        `Failed to delete branch: ${err.message}`,
      );
    }
  }

  async mergeBranch(
    repoId: string,
    userId: string,
    sourceBranch: string,
    targetBranch?: string,
    fastForwardOnly = false,
  ): Promise<MergeResponse> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
      const finalTargetBranch = targetBranch || currentBranch;

      if (currentBranch !== finalTargetBranch) {
        await git.checkout(finalTargetBranch);
      }

      const beforeHash = (await git.revparse(["HEAD"])).trim();

      if (fastForwardOnly) {
        throw new ConflictException(
          "Fast-forward merge is not allowed. Use 3-way merge only.",
        );
      }

      await git.merge([sourceBranch, "--no-ff"]);

      const afterHash = (await git.revparse(["HEAD"])).trim();
      const fastForward = beforeHash !== afterHash;

      const statusResult = await git.status();
      const conflictFiles = statusResult.conflicted || [];
      const hasConflict = conflictFiles.length > 0;

      return {
        success: true,
        fastForward,
        from: beforeHash,
        to: afterHash,
        sourceBranch,
        targetBranch: finalTargetBranch,
        hasConflict,
        conflictFiles,
      };
    } catch (err) {
      if (/merge conflict/i.test(err.message)) {
        throw new ConflictException(
          "Merge conflict detected. Please resolve conflicts manually.",
        );
      }
      if (/fast-forward/i.test(err.message)) {
        throw new ConflictException("Fast-forward merge not possible");
      }
      if (/pathspec.*did not match/i.test(err.message)) {
        throw new NotFoundException(
          `타겟 브랜치 '${targetBranch}'를 찾을 수 없습니다.`,
        );
      }
      throw new InternalServerErrorException(`Merge failed: ${err.message}`);
    }
  }

  async getGraph(repoId: string, userId: string, since?: string, max = 200) {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      return await this.graphBuilder.build(git, since, max);
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to get commit graph: ${err.message}`,
      );
    }
  }
}
