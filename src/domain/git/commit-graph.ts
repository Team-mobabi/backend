/**
 * 커밋 그래프 계산 (순수 함수).
 * main의 first-parent 체인을 기준선으로 보고, 각 브랜치가 main에서 갈라진 지점(forkPoint)과
 * 커밋별 소속 브랜치를 계산한다.
 */

const SEP = "\x1f";

/** 커밋 메시지에 "|" 등이 있어도 깨지지 않도록 unit separator로 구분 */
export const LOG_FORMAT = ["%H", "%P", "%an", "%ai", "%s"].join("%x1f");

export interface GraphCommit {
  readonly hash: string;
  readonly shortHash: string;
  readonly parents: readonly string[];
  readonly author: string;
  readonly committedAt: string;
  readonly message: string;
  readonly isMerge: boolean;
}

export type BranchHeads = Readonly<Record<string, string>>;

export const parseLog = (raw: string): GraphCommit[] =>
  raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [hash, parents, author, committedAt, ...message] = line.split(SEP);
      const parentList = parents ? parents.split(" ") : [];
      return {
        hash,
        shortHash: hash.substring(0, 7),
        parents: parentList,
        author,
        committedAt,
        message: message.join(SEP),
        isMerge: parentList.length > 1,
      };
    });

/** 브랜치 head는 축약 해시일 수 있어 접두어 매칭이 필요하다 */
const indexCommits = (commits: readonly GraphCommit[]) => {
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const cache = new Map<string, GraphCommit | undefined>();
  return (hash: string): GraphCommit | undefined => {
    const exact = byHash.get(hash);
    if (exact) return exact;
    if (!cache.has(hash)) {
      cache.set(
        hash,
        commits.find((c) => c.hash.startsWith(hash)),
      );
    }
    return cache.get(hash);
  };
};

/** head에서 first-parent를 따라가며 방문 (stop이 true면 그 커밋에서 멈춤) */
const walkFirstParent = (
  lookup: (hash: string) => GraphCommit | undefined,
  head: string,
  visit: (commit: GraphCommit) => "continue" | "stop",
): void => {
  const visited = new Set<string>();
  let current: string | undefined = head;
  while (current && !visited.has(current)) {
    visited.add(current);
    const commit = lookup(current);
    if (!commit || visit(commit) === "stop") return;
    current = commit.parents[0];
  }
};

const headBranchAt = (
  commit: GraphCommit,
  heads: BranchHeads,
): string | null => {
  const pointing = Object.entries(heads).filter(([, hash]) =>
    commit.hash.startsWith(hash),
  );
  if (pointing.length === 0) return null;
  return pointing.find(([name]) => name === "main")?.[0] ?? pointing[0][0];
};

const branchCommits = (
  lookup: (hash: string) => GraphCommit | undefined,
  heads: BranchHeads,
) =>
  Object.fromEntries(
    Object.entries(heads).map(([name, head]) => {
      const commits: Array<{
        hash: string;
        message: string;
        author: string;
        committedAt: string;
        parents: readonly string[];
        files: never[];
      }> = [];
      walkFirstParent(lookup, head, (c) => {
        commits.push({
          hash: c.hash,
          message: c.message,
          author: c.author,
          committedAt: c.committedAt,
          parents: c.parents,
          files: [],
        });
        return "continue";
      });
      return [name, commits];
    }),
  );

export const buildCommitGraph = (
  commits: readonly GraphCommit[],
  localBranches: BranchHeads,
  remoteBranches: BranchHeads,
  currentBranch: string,
) => {
  const lookup = indexCommits(commits);
  const mainHead = localBranches.main;

  const mainCommits = new Set<string>();
  if (mainHead) {
    walkFirstParent(lookup, mainHead, (c) => {
      mainCommits.add(c.hash);
      return "continue";
    });
  }

  const forkPoints: Record<string, string | null> = {};
  if (mainHead) {
    for (const [name, head] of Object.entries(localBranches)) {
      if (name === "main") continue;
      let forkPoint: string | null = null;
      walkFirstParent(lookup, head, (c) => {
        if (!mainCommits.has(c.hash)) return "continue";
        forkPoint = c.hash;
        return "stop";
      });
      forkPoints[name] = forkPoint;
    }
  }

  const commitBranches = new Map<string, string[]>();
  const tag = (hash: string, branch: string) => {
    const list = commitBranches.get(hash) ?? [];
    list.push(branch);
    commitBranches.set(hash, list);
  };
  if (mainHead) {
    walkFirstParent(lookup, mainHead, (c) => {
      tag(c.hash, "main");
      return "continue";
    });
  }
  for (const [name, head] of Object.entries(localBranches)) {
    if (name === "main") continue;
    const forkPoint = forkPoints[name];
    walkFirstParent(lookup, head, (c) => {
      tag(c.hash, name);
      return forkPoint && c.hash.startsWith(forkPoint) ? "stop" : "continue";
    });
  }

  return {
    local: {
      branches: branchCommits(lookup, localBranches),
      branchHeads: localBranches,
    },
    remote: {
      branches: branchCommits(lookup, remoteBranches),
      branchHeads: remoteBranches,
    },
    currentBranch,
    branchHeads: localBranches,
    commits: commits.map((commit) => {
      const localHead = headBranchAt(commit, localBranches);
      return {
        ...commit,
        branches: commitBranches.get(commit.hash) ?? [],
        isHead: localHead,
        localIsHead: localHead,
        remoteIsHead: headBranchAt(commit, remoteBranches),
      };
    }),
    forkPoints,
  };
};

export type CommitGraph = ReturnType<typeof buildCommitGraph>;
