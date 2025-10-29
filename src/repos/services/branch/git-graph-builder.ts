import { Logger } from "@nestjs/common";
import { SimpleGit, BranchSummaryBranch, DefaultLogFields } from "simple-git";

interface Commit {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  committedAt: string;
  message: string;
  isMerge: boolean;
}

interface BranchInfo {
  localBranches: Record<string, string>;
  remoteBranches: Record<string, string>;
  currentBranch: string;
}

export class GitGraphBuilder {
  private readonly logger = new Logger(GitGraphBuilder.name);

  async build(git: SimpleGit, since?: string, max = 200) {
    const branchInfo = await this.collectBranches(git);
    const allCommits = await this.fetchCommits(git, branchInfo, max, since);

    const mainCommits = this.collectMainCommits(allCommits, branchInfo.localBranches);
    const branchForkPoints = this.calculateForkPoints(allCommits, branchInfo.localBranches, mainCommits);
    const commitToBranches = this.mapCommitsToBranches(allCommits, branchInfo.localBranches, mainCommits, branchForkPoints);

    const enrichedCommits = this.enrichCommitsWithBranches(
      allCommits,
      commitToBranches,
      branchInfo.localBranches,
      branchInfo.remoteBranches
    );

    const local = {
      branches: this.buildBranchCommits(allCommits, branchInfo.localBranches),
      branchHeads: branchInfo.localBranches,
    };

    const remote = {
      branches: this.buildBranchCommits(allCommits, branchInfo.remoteBranches),
      branchHeads: branchInfo.remoteBranches,
    };

    return {
      local,
      remote,
      currentBranch: branchInfo.currentBranch,
      branchHeads: branchInfo.localBranches,
      commits: enrichedCommits,
      forkPoints: branchForkPoints,
    };
  }

  private async collectBranches(git: SimpleGit): Promise<BranchInfo> {
    const branchInfo = await git.branch(["-a"]);
    const currentBranch = branchInfo.current;
    const localBranches: Record<string, string> = {};
    const remoteBranches: Record<string, string> = {};

    for (const [name, obj] of Object.entries(branchInfo.branches) as [string, BranchSummaryBranch][]) {
      if (name.startsWith("remotes/origin/")) {
        const branchName = name.replace("remotes/origin/", "");
        remoteBranches[branchName] = obj.commit;
      } else if (!name.startsWith("remotes/")) {
        localBranches[name] = obj.commit;
      }
    }

    this.logger.debug(`Local branches: ${Object.entries(localBranches).map(([name, hash]) => `${name}: ${hash.substring(0, 7)}`).join(', ')}`);
    this.logger.debug(`Remote branches: ${Object.entries(remoteBranches).map(([name, hash]) => `${name}: ${hash.substring(0, 7)}`).join(', ')}`);

    return { localBranches, remoteBranches, currentBranch };
  }

  private async fetchCommits(
    git: SimpleGit,
    branchInfo: BranchInfo,
    max: number,
    since?: string
  ): Promise<Commit[]> {
    const pretty = "%H|%P|%an|%ai|%s";

    const branchRefs = [
      ...Object.keys(branchInfo.localBranches),
      ...Object.keys(branchInfo.remoteBranches).map(b => `remotes/origin/${b}`)
    ];

    const args: string[] = [
      ...branchRefs,
      "--date-order",
      `--max-count=${max}`,
      `--pretty=${pretty}`,
    ];
    if (since) args.push(`^${since}`);

    const raw = await git.raw(["log", ...args]);
    return raw
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
  }

  private collectMainCommits(allCommits: Commit[], localBranches: Record<string, string>): Set<string> {
    const mainCommits = new Set<string>();

    if (!localBranches.main) {
      return mainCommits;
    }

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
    return mainCommits;
  }

  private calculateForkPoints(
    allCommits: Commit[],
    localBranches: Record<string, string>,
    mainCommits: Set<string>
  ): Record<string, string | null> {
    const branchForkPoints: Record<string, string | null> = {};

    if (!localBranches.main) {
      return branchForkPoints;
    }

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

    return branchForkPoints;
  }

  private mapCommitsToBranches(
    allCommits: Commit[],
    localBranches: Record<string, string>,
    mainCommits: Set<string>,
    branchForkPoints: Record<string, string | null>
  ): Map<string, string[]> {
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

    return commitToBranches;
  }

  private enrichCommitsWithBranches(
    allCommits: Commit[],
    commitToBranches: Map<string, string[]>,
    localBranches: Record<string, string>,
    remoteBranches: Record<string, string>
  ) {
    return allCommits.map(commit => {
      const branches = commitToBranches.get(commit.hash) || [];

      const localHeadsPointingHere = Object.entries(localBranches).filter(
        ([_, hash]) => commit.hash === hash || commit.hash.startsWith(hash)
      );

      let localHeadBranch: string | null = null;
      if (localHeadsPointingHere.length > 0) {
        const mainHead = localHeadsPointingHere.find(([name, _]) => name === 'main');
        localHeadBranch = mainHead ? mainHead[0] : localHeadsPointingHere[0][0];
      }

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
        isHead: localHeadBranch,
        localIsHead: localHeadBranch,
        remoteIsHead: remoteHeadBranch,
      };
    });
  }

  private buildBranchCommits(allCommits: Commit[], branchHeads: Record<string, string>) {
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
  }
}
