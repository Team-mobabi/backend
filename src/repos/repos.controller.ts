import {Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards} from '@nestjs/common';

import {ReposService} from '@src/repos/repos.service';
import {Repo} from '@src/repos/entities/repo.entity';

import {CreateRepoDto} from '@src/repos/dto/create-repo.dto';
import {AddRemoteDto} from './dto/add-remote.dto';
import {PushDto} from './dto/push.dto';
import {CreateLocalRemoteDto} from './dto/create-local-remote.dto';
import {AddDto} from "@src/repos/dto/add.dto";
import {CommitDto} from "@src/repos/dto/commit.dto";
import {AuthGuard} from "@nestjs/passport";
import {AuthUser} from "@src/repos/auth-user.decorator";
import {User} from "@src/auth/entities/auth.entity";

@Controller('repos')
@UseGuards(AuthGuard('jwt'))
export class ReposController {
    constructor(private readonly reposService: ReposService) {
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async createRepo(@Body() createRepoDto: CreateRepoDto,
                     @AuthUser() user: User): Promise<Repo> {
        const currentUserId = user.id;
        return this.reposService.createRepo(createRepoDto, currentUserId);
    }

    @Post(':repoId/add')
    @HttpCode(HttpStatus.OK)
    async addFiles(
        @Param('repoId') repoId: string,
        @Body() addDto: AddDto,
    ) {
        return this.reposService.addFilesToRepo(repoId, addDto.files);
    }

    @Post(':repoId/commit')
    @HttpCode(HttpStatus.OK)
    async commit(
        @Param('repoId') repoId: string,
        @Body() commitDto: CommitDto,
    ) {
        return this.reposService.commitToRepo(repoId, commitDto.message);
    }

    @Post(':repoId/remote')
    @HttpCode(HttpStatus.NO_CONTENT)
    async registerRemote(
        @Param('repoId') repoId: string,
        @Body() addRemoteDto: AddRemoteDto,
    ) {
        await this.reposService.addRemote(repoId, addRemoteDto.url, addRemoteDto.name);
    }

    @Post(':repoId/pull')
    @HttpCode(HttpStatus.OK)
    pull(@Param('repoId') repoId: string) {
        return this.reposService.pullRepo(repoId);
    }

    @Get(':repoId/status')
    async getStatus(@Param('repoId') repoId: string) {
        const files = await this.reposService.status(repoId);
        return {files};
    }

    @Post(':repoId/push')
    @HttpCode(HttpStatus.OK)
    async push(
        @Param('repoId') repoId: string,
        @Body() pushDto: PushDto,
    ) {
        return this.reposService.pushRepo(
            repoId,
            pushDto.remote,
            pushDto.branch,
        );
    }

    @Get(':repoId/branches')
    @HttpCode(HttpStatus.OK)
    async listBranches(
        @Param('repoId') repoId: string,
        @Query('limit') limit?: string,
    ) {
        const commitLimit = limit ? Number(limit) : 20;
        return this.reposService.getBranches(repoId, commitLimit);
    }

    @Get(':repoId/graph')
    @HttpCode(HttpStatus.OK)
    async graph(
        @Param('repoId') repoId: string,
        @Query('since') since?: string,
        @Query('max') max?: string,
    ) {
        return this.reposService.getGraph(repoId, since, Number(max) || 200);
    }

    @Post(':repoId/remote-local')
    @HttpCode(HttpStatus.CREATED)
    async createLocalRemote(
        @Param('repoId') repoId: string,
        @Body() createLocalRemoteDto: CreateLocalRemoteDto,
    ) {
        const remoteInfo = await this.reposService.createLocalRemote(
            repoId,
            createLocalRemoteDto.name,
        );
        return {
            success: true,
            remotePath: remoteInfo.path,
            remoteName: remoteInfo.name,
        };
    }
}
