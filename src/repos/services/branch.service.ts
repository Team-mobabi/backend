import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
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
import { ConfigService } from "@nestjs/config";
import { BaseRepoService } from "@src/repos/services/base-repo.service";
import { MergeResponse } from "@src/repos/dto/responses.dto";

@Injectable()
export class BranchService extends BaseRepoService {
  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    configService: ConfigService,
  ) {
    super(repoRepository, configService);
  }

  async getBranches(repoId: string, userId: string, limit = 20) {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const branchRes = await git.branchLocal();
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
          };
        }),
      );
      return { branches };
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
      return { success: true, message: `Branch '${newBranchName}' created.` };
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

      // 타겟 브랜치로 전환 (필요한 경우)
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

      // 충돌 체크
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
      const branchInfo = await git.branch(["-a"]);
      const localBranches: Record<string, string> = {};
      const remoteBranches: Record<string, string> = {};

      for (const [name, obj] of Object.entries(branchInfo.branches) as [
        string,
        BranchSummaryBranch,
      ][]) {
        if (name.startsWith("remotes/origin/")) {
          const branchName = name.replace("remotes/origin/", "");
          remoteBranches[branchName] = obj.commit;
        } else if (!name.startsWith("remotes/")) {
          localBranches[name] = obj.commit;
        }
      }

      const pretty = "%H|%P|%an|%ai|%s";
      const args: string[] = [
        "--all",
        "--reverse",
        `--max-count=${max}`,
        `--pretty=${pretty}`,
      ];
      if (since) args.push(`^${since}`);

      const raw = await git.raw(["log", ...args]);
      const allCommits = raw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, parents, author, iso, msg] = line.split("|");
          return {
            hash,
            parents: parents ? parents.split(" ") : [],
            author,
            committedAt: iso,
            message: msg,
          };
        });

      // 각 브랜치별로 커밋 배열을 구성
      const buildBranchCommits = (branchHeads: Record<string, string>) => {
        const result: Record<string, any[]> = {};
        for (const [branchName, headHash] of Object.entries(branchHeads)) {
          const commits: any[] = [];
          let currentHash: string | null = headHash;
          const visited = new Set<string>();

          while (currentHash && !visited.has(currentHash)) {
            visited.add(currentHash);
            const commit = allCommits.find(c => c.hash.startsWith(currentHash as string));
            if (!commit) break;

            commits.push({
              hash: commit.hash,
              message: commit.message,
              author: commit.author,
              committedAt: commit.committedAt,
              parents: commit.parents,
              files: [] // 파일 정보는 필요시 추가
            });

            currentHash = commit.parents[0] || null;
          }

          result[branchName] = commits.reverse(); // 오래된 커밋부터
        }
        return result;
      };

      const local = {
        branches: buildBranchCommits(localBranches)
      };

      const remote = {
        branches: buildBranchCommits(remoteBranches)
      };

      return { local, remote };
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to get commit graph: ${err.message}`,
      );
    }
  }
}
