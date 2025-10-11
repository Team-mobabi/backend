import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Repo } from "@src/repos/entities/repo.entity";
import { BaseRepoService } from "@src/repos/services/base-repo.service";
import { GitOperationException } from "@src/repos/exceptions/repo.exceptions";

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

      // 전체 파일 목록 (커밋된 파일 포함)
      let allFiles: string[] = [];
      try {
        const filesOutput = await git.raw(["ls-files"]);
        allFiles = filesOutput.trim().split("\n").filter(Boolean);
      } catch {
        // 파일이 없거나 에러가 나면 빈 배열
        allFiles = [];
      }

      return {
        changes,           // 변경사항 (modified, untracked, added 등)
        files: allFiles,   // 전체 파일 목록 (커밋된 파일 포함)
        isEmpty: allFiles.length === 0  // 저장소가 비어있는지
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
    const { git } = await this.getRepoAndGit(repoId, userId);

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

    // 커밋 실행
    let commitResult;
    try {
      commitResult = await git.commit(message, undefined, {
        "--no-gpg-sign": null,
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
}