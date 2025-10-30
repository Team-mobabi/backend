import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Repo } from "@src/repos/entities/repo.entity";
import { RepoCollaborator } from "@src/repos/entities/repo-collaborator.entity";
import { ConfigService } from "@nestjs/config";
import { BaseRepoService } from "@src/repos/services/base-repo.service";
import simpleGit from "simple-git";
import * as path from "node:path";

export interface DiffResult {
  file: string;
  additions: number;
  deletions: number;
  changes: DiffChange[];
}

export interface DiffChange {
  lineNumber: number;
  type: "add" | "delete" | "context";
  content: string;
}

export interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  diff: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

@Injectable()
export class GitDiffService extends BaseRepoService {
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
   * 작업 디렉토리의 변경사항 (unstaged) diff
   */
  async getWorkingDiff(
    repoId: string,
    userId: string,
    filePath?: string,
  ): Promise<FileDiff[]> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const diffArgs = filePath ? ["--", filePath] : [];
      const diffOutput = await git.diff(diffArgs);

      return this.parseDiffOutput(diffOutput);
    } catch (error) {
      throw new Error(`Working diff 조회 실패: ${error.message}`);
    }
  }

  /**
   * Staged 변경사항 diff
   */
  async getStagedDiff(
    repoId: string,
    userId: string,
    filePath?: string,
  ): Promise<FileDiff[]> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const diffArgs = ["--cached"];
      if (filePath) diffArgs.push("--", filePath);

      const diffOutput = await git.diff(diffArgs);

      return this.parseDiffOutput(diffOutput);
    } catch (error) {
      throw new Error(`Staged diff 조회 실패: ${error.message}`);
    }
  }

  /**
   * 두 커밋 간 diff
   */
  async getCommitDiff(
    repoId: string,
    userId: string,
    commitA: string,
    commitB: string,
    filePath?: string,
  ): Promise<FileDiff[]> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const diffArgs = [commitA, commitB];
      if (filePath) diffArgs.push("--", filePath);

      const diffOutput = await git.diff(diffArgs);

      return this.parseDiffOutput(diffOutput);
    } catch (error) {
      throw new Error(`Commit diff 조회 실패: ${error.message}`);
    }
  }

  /**
   * 브랜치 간 diff
   */
  async getBranchDiff(
    repoId: string,
    userId: string,
    sourceBranch: string,
    targetBranch: string,
    filePath?: string,
  ): Promise<FileDiff[]> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const diffArgs = [targetBranch, sourceBranch];
      if (filePath) diffArgs.push("--", filePath);

      const diffOutput = await git.diff(diffArgs);

      return this.parseDiffOutput(diffOutput);
    } catch (error) {
      throw new Error(`Branch diff 조회 실패: ${error.message}`);
    }
  }

  /**
   * 특정 커밋의 변경사항 (부모와 비교)
   */
  async getCommitChanges(
    repoId: string,
    userId: string,
    commitHash: string,
    filePath?: string,
  ): Promise<FileDiff[]> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const diffArgs = [`${commitHash}^`, commitHash];
      if (filePath) diffArgs.push("--", filePath);

      const diffOutput = await git.diff(diffArgs);

      return this.parseDiffOutput(diffOutput);
    } catch (error) {
      throw new Error(`Commit changes 조회 실패: ${error.message}`);
    }
  }

  /**
   * 변경된 파일 목록만 가져오기 (diff 내용 없이)
   */
  async getChangedFiles(
    repoId: string,
    userId: string,
    commitA?: string,
    commitB?: string,
  ): Promise<{ path: string; status: string }[]> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const args = ["--name-status"];

      if (commitA && commitB) {
        args.push(commitA, commitB);
      } else if (commitA) {
        args.push(`${commitA}^`, commitA);
      }

      const output = await git.diff(args);

      return this.parseFileStatus(output);
    } catch (error) {
      throw new Error(`Changed files 조회 실패: ${error.message}`);
    }
  }

  /**
   * Diff 통계 (additions, deletions)
   */
  async getDiffStats(
    repoId: string,
    userId: string,
    commitA?: string,
    commitB?: string,
  ): Promise<{
    files: number;
    additions: number;
    deletions: number;
    fileStats: { path: string; additions: number; deletions: number }[];
  }> {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const args = ["--numstat"];

      if (commitA && commitB) {
        args.push(commitA, commitB);
      } else if (commitA) {
        args.push(`${commitA}^`, commitA);
      }

      const output = await git.diff(args);

      return this.parseNumstat(output);
    } catch (error) {
      throw new Error(`Diff stats 조회 실패: ${error.message}`);
    }
  }

  /**
   * Bare 저장소에서 직접 브랜치 간 diff 조회 (PR용)
   * 사용자 로컬 저장소를 건드리지 않고 공유 bare 저장소에서 직접 조회
   */
  async getBranchDiffFromRemote(
    repoId: string,
    sourceBranch: string,
    targetBranch: string,
    filePath?: string,
  ): Promise<FileDiff[]> {
    const remotePath = path.join(this.remoteBasePath, `${repoId}.git`);
    const git = simpleGit(remotePath);

    try {
      const diffArgs = [targetBranch, sourceBranch];
      if (filePath) diffArgs.push("--", filePath);

      const diffOutput = await git.diff(diffArgs);

      return this.parseDiffOutput(diffOutput);
    } catch (error) {
      throw new Error(`Branch diff 조회 실패: ${error.message}`);
    }
  }

  /**
   * Git diff 출력을 파싱
   */
  private parseDiffOutput(diffOutput: string): FileDiff[] {
    if (!diffOutput || diffOutput.trim() === '') {
      return [];
    }

    const files: FileDiff[] = [];
    const fileDiffs = diffOutput.split(/^diff --git /m).filter(Boolean);

    for (const fileDiff of fileDiffs) {
      const lines = fileDiff.split('\n');

      // 파일 경로 추출 (a/path b/path 형식)
      const pathMatch = lines[0].match(/a\/(.*?) b\/(.*?)$/);
      if (!pathMatch) continue;

      const path = pathMatch[2];

      // Binary 파일 체크
      const isBinary = fileDiff.includes('Binary files');

      if (isBinary) {
        files.push({
          path,
          oldContent: '',
          newContent: '',
          diff: fileDiff,
          additions: 0,
          deletions: 0,
          isBinary: true,
        });
        continue;
      }

      // 변경사항 카운트
      let additions = 0;
      let deletions = 0;
      let oldContent = '';
      let newContent = '';

      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          additions++;
          newContent += line.substring(1) + '\n';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++;
          oldContent += line.substring(1) + '\n';
        } else if (line.startsWith(' ')) {
          // Context line
          const content = line.substring(1) + '\n';
          oldContent += content;
          newContent += content;
        }
      }

      files.push({
        path,
        oldContent: oldContent.trim(),
        newContent: newContent.trim(),
        diff: fileDiff,
        additions,
        deletions,
        isBinary: false,
      });
    }

    return files;
  }

  /**
   * --name-status 출력 파싱
   */
  private parseFileStatus(output: string): { path: string; status: string }[] {
    if (!output || output.trim() === '') {
      return [];
    }

    const lines = output.trim().split('\n');
    const files: { path: string; status: string }[] = [];

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const status = this.getStatusName(parts[0]);
        const path = parts[1];
        files.push({ path, status });
      }
    }

    return files;
  }

  /**
   * --numstat 출력 파싱
   */
  private parseNumstat(output: string): {
    files: number;
    additions: number;
    deletions: number;
    fileStats: { path: string; additions: number; deletions: number }[];
  } {
    if (!output || output.trim() === '') {
      return {
        files: 0,
        additions: 0,
        deletions: 0,
        fileStats: [],
      };
    }

    const lines = output.trim().split('\n');
    const fileStats: { path: string; additions: number; deletions: number }[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10);
        const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10);
        const path = parts[2];

        fileStats.push({ path, additions, deletions });
        totalAdditions += additions;
        totalDeletions += deletions;
      }
    }

    return {
      files: fileStats.length,
      additions: totalAdditions,
      deletions: totalDeletions,
      fileStats,
    };
  }

  /**
   * Git status 코드를 사람이 읽을 수 있는 이름으로 변환
   */
  private getStatusName(code: string): string {
    const statusMap: Record<string, string> = {
      'A': 'added',
      'M': 'modified',
      'D': 'deleted',
      'R': 'renamed',
      'C': 'copied',
      'U': 'unmerged',
    };

    return statusMap[code] || code;
  }
}
