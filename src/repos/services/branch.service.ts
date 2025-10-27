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

      // 현재 브랜치 확인
      const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]);

      // 현재 커밋 해시
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

      // 모든 커밋 가져오기 (시간순 정렬)
      const pretty = "%H|%P|%an|%ai|%s";
      const args: string[] = [
        "--all",
        "--date-order", // 시간순 정렬 (병합 관계 유지)
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
            isMerge: parentsList.length > 1, // 병합 커밋인지
          };
        });

      // 각 브랜치의 fork point 먼저 계산
      const branchForkPoints: Record<string, string | null> = {};

      if (localBranches.main) {
        for (const [branchName, headHash] of Object.entries(localBranches)) {
          if (branchName === 'main') continue;

          try {
            // merge-base로 공통 조상 찾기
            const mergeBase = await git.raw([
              'merge-base',
              'main',
              branchName
            ]);
            branchForkPoints[branchName] = mergeBase.trim();
          } catch {
            branchForkPoints[branchName] = null;
          }
        }
      }

      // 각 커밋이 어느 브랜치에 속하는지 계산
      const commitToBranches: Map<string, string[]> = new Map();

      // main 브랜치 먼저 마킹 (모든 커밋 포함)
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

      // 다른 브랜치는 fork point 이후 커밋만 마킹
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

          // fork point에 도달하면 중단 (fork point는 main에 속함)
          if (forkPoint && fullHash.startsWith(forkPoint)) {
            // fork point도 이 브랜치에 속한다고 표시 (공통 조상)
            if (!commitToBranches.has(fullHash)) {
              commitToBranches.set(fullHash, []);
            }
            commitToBranches.get(fullHash)?.push(branchName);
            break;
          }

          // 일반 커밋 마킹
          if (!commitToBranches.has(fullHash)) {
            commitToBranches.set(fullHash, []);
          }
          commitToBranches.get(fullHash)?.push(branchName);

          currentHash = commit.parents[0] || null;
        }
      }

      // 커밋에 브랜치 정보 추가
      const enrichedCommits = allCommits.map(commit => {
        const branches = commitToBranches.get(commit.hash) || [];

        // isHead 계산: 이 커밋을 가리키는 모든 브랜치 찾기
        const headsPointingHere = Object.entries(localBranches).filter(
          ([_, hash]) => commit.hash === hash || commit.hash.startsWith(hash)
        );

        // 여러 브랜치가 같은 커밋을 가리킬 때: main 우선, 그 다음 사전순
        let headBranch: string | null = null;
        if (headsPointingHere.length > 0) {
          const mainHead = headsPointingHere.find(([name, _]) => name === 'main');
          headBranch = mainHead ? mainHead[0] : headsPointingHere[0][0];
        }

        return {
          ...commit,
          branches, // 이 커밋이 속한 브랜치들
          isHead: headBranch, // 브랜치 HEAD인지 (main 우선)
        };
      });

      // 각 브랜치별로 커밋 배열 구성 (기존 방식 유지)
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

          result[branchName] = commits;  // reverse 제거 - 최신 커밋이 먼저 (HEAD부터 시작)
        }
        return result;
      };

      const local = {
        branches: buildBranchCommits(localBranches),
        branchHeads: localBranches,  // 로컬 브랜치의 HEAD 커밋들
      };

      const remote = {
        branches: buildBranchCommits(remoteBranches),
        branchHeads: remoteBranches,  // 리모트 브랜치의 HEAD 커밋들
      };

      return {
        local,
        remote,
        currentBranch,
        branchHeads: localBranches, // 하위 호환성을 위해 유지
        commits: enrichedCommits, // 전체 커밋 그래프 (브랜치 정보 포함)
        forkPoints: branchForkPoints, // 각 브랜치의 분기점
      };
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to get commit graph: ${err.message}`,
      );
    }
  }
}
