import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { Repo } from "@src/repos/entities/repo.entity";
import { BaseRepoService } from "@src/repos/services/base-repo.service";

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
    const st = await git.status();

    return [
      ...st.modified.map((f) => ({ name: f, status: "modified" })),
      ...st.not_added.map((f) => ({ name: f, status: "untracked" })),
      ...st.created.map((f) => ({ name: f, status: "added" })),
      ...st.deleted.map((f) => ({ name: f, status: "deleted" })),
      ...st.renamed.map((r) => ({ name: r.to, status: "renamed" })),
    ];
  }

  async addFiles(repoId: string, userId: string, files?: string[]) {
    const { git } = await this.getRepoAndGit(repoId, userId);
    const addTarget = files?.length ? files : ".";
    await git.add(addTarget);

    const status = await git.status();
    return { success: true, stagedFiles: status.staged || [] };
  }

  async commit(
    repoId: string,
    userId: string,
    message: string,
    branch?: string,
  ) {
    const { git } = await this.getRepoAndGit(repoId, userId);

    if (branch) {
      const current = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
      if (current !== branch) {
        await git.checkout(["-B", branch]);
      }
    }

    const commitResult = await git.commit(message, undefined, {
      "--no-gpg-sign": null,
    });
    const [{ hash, message: msg, date }] = (await git.log({ maxCount: 1 })).all;

    return {
      success: true,
      commitHash: hash,
      message: msg,
      committedAt: date,
      stats: commitResult.summary,
    };
  }
}