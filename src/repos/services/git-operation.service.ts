import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Repo } from "@src/repos/entities/repo.entity";
import { User } from "@src/users/entities/user.entity";
import { BaseRepoService } from "@src/repos/services/base-repo.service";
import { GitOperationException } from "@src/repos/exceptions/repo.exceptions";
import { ResetMode } from "@src/repos/dto/reset.dto";

@Injectable()
export class GitOperationService extends BaseRepoService {
  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    configService: ConfigService,
  ) {
    super(repoRepository, configService);
  }

  async status(repoId: string, userId: string) {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      const st = await git.status();

      // 변경사항 목록
      const changes = [
        ...st.modified.map((f) => ({ name: f, status: "modified" })),
        ...st.not_added.map((f) => ({ name: f, status: "untracked" })),
        ...st.created.map((f) => ({ name: f, status: "added" })),
        ...st.deleted.map((f) => ({ name: f, status: "deleted" })),
        ...st.renamed.map((r) => ({ name: r.to, status: "renamed" })),
      ];

      // 전체 파일 목록 (커밋된 파일 포함) - git ls-files 사용
      let allFiles: string[] = [];
      try {
        const filesOutput = await git.raw(["ls-files"]);
        allFiles = filesOutput.trim().split("\n").filter(Boolean);
      } catch {
        // 파일이 없거나 에러가 나면 빈 배열
        allFiles = [];
      }

      // 호환성을 위해 이전 형식 유지하면서 추가 정보 제공
      return {
        files: changes,           // 이전 방식 (변경사항만) - 호환성 유지
        allFiles,                 // 전체 파일 목록 (새로 추가)
        isEmpty: allFiles.length === 0  // 저장소 비어있는지 (새로 추가)
      };
    } catch (err) {
      throw new GitOperationException("status", err.message);
    }
  }

  async addFiles(repoId: string, userId: string, files?: string[]) {
    const { repo, git } = await this.getRepoAndGit(repoId, userId);

    // 전체 추가 (.) 또는 특정 파일들
    if (!files || files.length === 0) {
      try {
        await git.add(".");
        const status = await git.status();
        return { success: true, stagedFiles: status.staged || [] };
      } catch (err) {
        throw new GitOperationException("add", err.message);
      }
    }

    // 특정 파일들 추가 - 파일 존재 여부 확인
    const invalidFiles: string[] = [];
    const validFiles: string[] = [];

    for (const file of files) {
      const filePath = path.join(repo.gitPath, file);
      try {
        await fs.access(filePath);
        validFiles.push(file);
      } catch {
        invalidFiles.push(file);
      }
    }

    if (invalidFiles.length > 0) {
      throw new GitOperationException(
        "add",
        `다음 파일을 찾을 수 없습니다: ${invalidFiles.join(", ")}`,
      );
    }

    try {
      await git.add(validFiles);
      const status = await git.status();
      return { success: true, stagedFiles: status.staged || [] };
    } catch (err) {
      throw new GitOperationException("add", err.message);
    }
  }

  async commit(
    repoId: string,
    userId: string,
    message: string,
    branch?: string,
  ) {
    const { repo, git } = await this.getRepoAndGit(repoId, userId);

    // 브랜치 전환 (필요한 경우)
    if (branch) {
      try {
        const current = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
        if (current !== branch) {
          await git.checkout(["-B", branch]);
        }
      } catch (err) {
        throw new GitOperationException(
          "commit",
          `브랜치 '${branch}'로 전환할 수 없습니다: ${err.message}`,
        );
      }
    }

    // 사용자 정보 가져오기
    const user = await this.repoRepository.manager.findOne(User, {
      where: { id: userId },
    });

    // 커밋 실행 (사용자별 Author 정보 설정)
    let commitResult;
    try {
      const authorName = user?.email?.split('@')[0] || 'Unknown';
      const authorEmail = user?.email || 'unknown@example.com';

      commitResult = await git.commit(message, undefined, {
        "--no-gpg-sign": null,
        "--author": `${authorName} <${authorEmail}>`,
      });
    } catch (err) {
      if (/nothing to commit/i.test(err.message)) {
        throw new GitOperationException(
          "commit",
          "커밋할 변경사항이 없습니다.",
        );
      }
      throw new GitOperationException("commit", err.message);
    }

    // 커밋 정보 조회
    try {
      const [{ hash, message: msg, date }] = (await git.log({ maxCount: 1 }))
        .all;

      return {
        success: true,
        commitHash: hash,
        message: msg,
        committedAt: date,
        stats: commitResult.summary,
      };
    } catch (err) {
      throw new GitOperationException(
        "commit",
        `커밋 정보를 가져올 수 없습니다: ${err.message}`,
      );
    }
  }

  /**
   * 특정 커밋으로 되돌리기 (Git Reset)
   *
   * @param repoId 레포지토리 ID
   * @param userId 사용자 ID
   * @param commitHash 되돌릴 커밋 해시
   * @param mode Reset 모드 (hard/soft/mixed)
   * @returns Reset 결과
   */
  async resetToCommit(
    repoId: string,
    userId: string,
    commitHash: string,
    mode: ResetMode = ResetMode.MIXED,
  ) {
    const { git } = await this.getRepoAndGit(repoId, userId);

    try {
      // 커밋 해시가 유효한지 확인
      try {
        await git.revparse([commitHash]);
      } catch {
        throw new NotFoundException(`커밋 '${commitHash}'를 찾을 수 없습니다.`);
      }

      // Reset 전 현재 상태 저장
      const beforeHash = (await git.revparse(["HEAD"])).trim();
      const beforeBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

      // Reset 실행
      const resetOption = `--${mode}`;
      await git.reset([resetOption, commitHash]);

      // Reset 후 상태
      const afterHash = (await git.revparse(["HEAD"])).trim();
      const status = await git.status();

      return {
        success: true,
        mode,
        from: beforeHash,
        to: afterHash,
        branch: beforeBranch,
        // 상태 정보
        modified: status.modified || [],
        staged: status.staged || [],
        message: this.getResetMessage(mode, beforeHash, afterHash),
      };
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      throw new GitOperationException("reset", err.message);
    }
  }

  /**
   * Reset 모드별 메시지 생성
   */
  private getResetMessage(mode: ResetMode, from: string, to: string): string {
    const fromShort = from.slice(0, 7);
    const toShort = to.slice(0, 7);

    switch (mode) {
      case ResetMode.HARD:
        return `Hard reset: ${fromShort} → ${toShort} (작업 디렉토리까지 완전히 되돌림)`;
      case ResetMode.SOFT:
        return `Soft reset: ${fromShort} → ${toShort} (변경사항은 staged 상태로 유지)`;
      case ResetMode.MIXED:
        return `Mixed reset: ${fromShort} → ${toShort} (변경사항은 unstaged 상태로 유지)`;
    }
  }
}