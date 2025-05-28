import {Body, Controller, Get, HttpCode, HttpException, HttpStatus, Param, Post, Query} from '@nestjs/common';

import {AddDto} from "@src/repos/dto/add.dto";
import {CreateRepoDto} from "@src/repos/dto/create-repo.dto";
import {Repo} from "@src/repos/entities/repo.entity";

import {ReposService} from '@src/repos/repos.service';
import {CommitDto} from "@src/repos/dto/commit.dto";

@Controller('repos')
export class ReposController {
  constructor(private readonly reposService: ReposService) {}

  @Post(':repoId/remote')
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerRemote(
    @Param('repoId') repoId: string,
    @Body() body: { url: string; name?: string },
  ) {
    await this.reposService.addRemote(repoId, body.url, body.name ?? 'origin');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRepo(@Body() createRepoDto: CreateRepoDto): Promise<Repo> {

    // 사용자 임시 변수로 가정
    const currentUserId = 'user-test-id';

    return await this.reposService.createRepo(createRepoDto, currentUserId);
  }

  @Post(':repoId/add')
  @HttpCode(HttpStatus.OK)
  async addFiles(
      @Param('repoId') repoId: string,
      @Body() addFilesDto: AddDto,
  ) {
    return await this.reposService.addFilesToRepo(repoId, addFilesDto.files);
  }

    @Post(':repoId/commit')
    @HttpCode(HttpStatus.OK)
    async commit(
        @Param('repoId') repoId: string,
        @Body() body: CommitDto,
    ) {
        return this.reposService.commitToRepo(repoId, body.message);
    }

  @Post(':repoId/push')
  @HttpCode(HttpStatus.OK)
  async push(
      @Param('repoId') repoId: string,
      @Body() body?: { remote?: string; branch?: string },
  ) {
    try {
      const result = await this.reposService.pushRepo(
          repoId,
          body?.remote ?? 'origin',
          body?.branch ?? 'main',
      );

      // ────────── 응답 가공 ──────────
      const pushed = (result.detail.pushed ?? []).map(item => ({
        local: item.local.replace(/^refs\/heads\//, ''),
        remote: item.remote.replace(/^refs\/heads\//, ''),
        updated: item.alreadyUpdated ?? false,
      }));

      return {
        success: true,
        upToDate: pushed.every(p => p.updated),
        pushed,
      };

    } catch (e) {
      throw new HttpException(
          e?.message ?? 'Push 실패',
          HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':repoId/branches')
  @HttpCode(HttpStatus.OK)
  async listBranches(
      @Param('repoId') repoId: string,
      @Query('limit')  limit?: string,
  ) {
    const commitLimit = limit ? Number(limit) : 20;
    return this.reposService.getBranches(repoId, commitLimit);
  }


}
