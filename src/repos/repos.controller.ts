import {Body, Controller, HttpCode, HttpStatus, Param, Post} from '@nestjs/common';

import {AddFilesDto} from "@src/repos/dto/add-files.dto";
import {CreateRepoDto} from "@src/repos/dto/create-repo.dto";
import {Repo} from "@src/repos/entities/repo.entity";

import {ReposService} from '@src/repos/repos.service';

@Controller('repos')
export class ReposController {
  constructor(private readonly reposService: ReposService) {}

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
      @Body() addFilesDto: AddFilesDto,
  ) {
    return await this.reposService.addFilesToRepo(repoId, addFilesDto.files);
  }
}
