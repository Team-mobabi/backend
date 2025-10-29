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
import { ConfigService } from "@nestjs/config";
import { BaseRepoService } from "@src/repos/services/base-repo.service";
import { MergeResponse } from "@src/repos/dto/responses.dto";

@Injectable()
export class BranchService extends BaseRepoService {
  private readonly logger = new Logger(BranchService.name);

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
      const branchInfo = await git.branch(["-a"]);
      const currentBranch = branchInfo.current;
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

      this.logger.debug(`Local branches: ${Object.entries(localBranches).map(([name, hash]) => `${name}: ${hash.substring(0, 7)}`).join(', ')}`);
      this.logger.debug(`Remote branches: ${Object.entries(remoteBranches).map(([name, hash]) => `${name}: ${hash.substring(0, 7)}`).join(', ')}`);

      const pretty = "%H|%P|%an|%ai|%s";

      const branchRefs = [
        ...Object.keys(localBranches),
        ...Object.keys(remoteBranches).map(b => `remotes/origin/${b}`)
      ];

      const args: string[] = [
        ...branchRefs,
        "--date-order",
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
          const parentsList = parents ? parents.split(" ") : [];
          return {
            hash,
            shortHash: hash.substring(0, 7),
            parents: parentsList,
            author,
            committedAt: iso,
            message: msg,
            isMerge: parentsList.length > 1,
          };
        });

      // 각 브랜치의 fork point 계산: merge-base는 merge 후 정확하지 않으므로
      // 브랜치 HEAD부터 역추적하여 main과 공통된 첫 커밋을 찾음
      const branchForkPoints: Record<string, string | null> = {};

      if (localBranches.main) {
        // main의 첫 번째 부모만 추적
        const mainCommits = new Set<string>();
        let currentHash: string | null = localBranches.main;
        const visited = new Set<string>();

        this.logger.debug(`Collecting main commits (first-parent only), starting from: ${localBranches.main.substring(0, 7)}`);

        while (currentHash && !visited.has(currentHash)) {
          visited.add(currentHash);

          const commit = allCommits.find(c => c.hash === currentHash || c.hash.startsWith(currentHash as string));
          if (!commit) {
            this.logger.debug(`Commit not found in allCommits: ${currentHash.substring(0, 7)}`);
            break;
          }

          this.logger.debug(`Adding to mainCommits: ${commit.shortHash} ${commit.message}`);
          mainCommits.add(commit.hash);

          currentHash = commit.parents[0] || null;
        }

        this.logger.debug(`Total main commits collected: ${mainCommits.size}`);

        for (const [branchName, headHash] of Object.entries(localBranches)) {
          if (branchName === 'main') continue;

          this.logger.debug(`Finding forkPoint for ${branchName}, HEAD: ${headHash.substring(0, 7)}`);

          let branchHash: string | null = headHash;
          const branchVisited = new Set<string>();
          let forkPoint: string | null = null;

          while (branchHash && !branchVisited.has(branchHash)) {
            branchVisited.add(branchHash);
            const commit = allCommits.find(c => c.hash === branchHash || c.hash.startsWith(branchHash as string));
            if (!commit) {
              this.logger.debug(`${branchName}: Commit not found: ${branchHash.substring(0, 7)}`);
              break;
            }

            this.logger.debug(`${branchName}: Checking commit ${commit.shortHash} (${commit.message}), in main: ${mainCommits.has(commit.hash)}`);

            if (mainCommits.has(commit.hash)) {
              forkPoint = commit.hash;
              this.logger.debug(`${branchName}: Found forkPoint: ${commit.shortHash} ${commit.message}`);
              break;
            }

            branchHash = commit.parents[0] || null;
          }

          branchForkPoints[branchName] = forkPoint;
          this.logger.debug(`${branchName}: Final forkPoint: ${forkPoint?.substring(0, 7) || 'null'}`);
        }
      }

      const commitToBranches: Map<string, string[]> = new Map();

      if (localBranches.main) {
        const visited = new Set<string>();
        let currentHash: string | null = localBranches.main;

        while (currentHash && !visited.has(currentHash)) {
          visited.add(currentHash);
          const commit = allCommits.find(c => c.hash === currentHash || c.hash.startsWith(currentHash as string));
          if (!commit) break;

          const fullHash = commit.hash;
          if (!commitToBranches.has(fullHash)) {
            commitToBranches.set(fullHash, []);
          }
          commitToBranches.get(fullHash)?.push('main');

          currentHash = commit.parents[0] || null;
        }
      }

      for (const [branchName, headHash] of Object.entries(localBranches)) {
        if (branchName === 'main') continue;

        const forkPoint = branchForkPoints[branchName];
        const visited = new Set<string>();
        let currentHash: string | null = headHash;

        while (currentHash && !visited.has(currentHash)) {
          visited.add(currentHash);
          const commit = allCommits.find(c => c.hash === currentHash || c.hash.startsWith(currentHash as string));
          if (!commit) break;

          const fullHash = commit.hash;

          // fork point에 도달하면 중단
          if (forkPoint && fullHash.startsWith(forkPoint)) {
            if (!commitToBranches.has(fullHash)) {
              commitToBranches.set(fullHash, []);
            }
            commitToBranches.get(fullHash)?.push(branchName);
            break;
          }

          if (!commitToBranches.has(fullHash)) {
            commitToBranches.set(fullHash, []);
          }
          commitToBranches.get(fullHash)?.push(branchName);

          currentHash = commit.parents[0] || null;
        }
      }

      const enrichedCommits = allCommits.map(commit => {
        const branches = commitToBranches.get(commit.hash) || [];

        // Local branches의 HEAD 확인
        const localHeadsPointingHere = Object.entries(localBranches).filter(
          ([_, hash]) => commit.hash === hash || commit.hash.startsWith(hash)
        );

        let localHeadBranch: string | null = null;
        if (localHeadsPointingHere.length > 0) {
          const mainHead = localHeadsPointingHere.find(([name, _]) => name === 'main');
          localHeadBranch = mainHead ? mainHead[0] : localHeadsPointingHere[0][0];
        }

        // Remote branches의 HEAD 확인
        const remoteHeadsPointingHere = Object.entries(remoteBranches).filter(
          ([_, hash]) => commit.hash === hash || commit.hash.startsWith(hash)
        );

        let remoteHeadBranch: string | null = null;
        if (remoteHeadsPointingHere.length > 0) {
          const mainHead = remoteHeadsPointingHere.find(([name, _]) => name === 'main');
          remoteHeadBranch = mainHead ? mainHead[0] : remoteHeadsPointingHere[0][0];
        }

        return {
          ...commit,
          branches,
          isHead: localHeadBranch,  // 기존 호환성 유지
          localIsHead: localHeadBranch,
          remoteIsHead: remoteHeadBranch,
        };
      });

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
              files: []
            });

            currentHash = commit.parents[0] || null;
          }

          result[branchName] = commits;
        }
        return result;
      };

      const local = {
        branches: buildBranchCommits(localBranches),
        branchHeads: localBranches,
      };

      const remote = {
        branches: buildBranchCommits(remoteBranches),
        branchHeads: remoteBranches,
      };

      return {
        local,
        remote,
        currentBranch,
        branchHeads: localBranches,
        commits: enrichedCommits,
        forkPoints: branchForkPoints,
      };
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to get commit graph: ${err.message}`,
      );
    }
  }
}
