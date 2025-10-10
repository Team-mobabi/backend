import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";
import { FilesInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import { ReposService } from "@src/repos/repos.service";
import { GitRemoteService } from "@src/repos/services/git-remote.service";
import { GitOperationService } from "@src/repos/services/git-operation.service";
import { BranchService } from "@src/repos/services/branch.service";
import { PullRequestService } from "@src/repos/services/pull-request.service";
import { FileService } from "@src/repos/services/file.service";
import { Repo } from "@src/repos/entities/repo.entity";
import { CreateRepoDto } from "@src/repos/dto/create-repo.dto";
import { ForkRepoDto } from "@src/repos/dto/fork-repo.dto";
import { AddRemoteDto } from "@src/repos/dto/add-remote.dto";
import { PushDto } from "@src/repos/dto/push.dto";
import { PullDto } from "@src/repos/dto/pull.dto";
import { CreateLocalRemoteDto } from "@src/repos/dto/create-local-remote.dto";
import { AddDto } from "@src/repos/dto/add.dto";
import { CommitDto } from "@src/repos/dto/commit.dto";
import { CreatePullRequestDto } from "@src/repos/dto/create-pull-request.dto";
import { MergePullRequestDto } from "@src/repos/dto/merge-pull-request.dto";
import { CreateReviewDto } from "@src/repos/dto/create-review.dto";
import { PullRequestStatus } from "@src/repos/entities/pull-request.entity";
import { User } from "@src/users/entities/user.entity";
import { AuthUser } from "@src/repos/auth-user.decorator";
import {
  CreateFileDto,
  UpdateFileDto,

} from "@src/repos/dto/file-operation.dto";
import { CreateBranchDto } from "@src/repos/dto/create-branch.dto";
import { SwitchBranchDto } from "@src/repos/dto/switch-branch.dto";
import { MergeBranchDto } from "@src/repos/dto/merge-branch.dto";

@ApiTags("repositories")
@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(AuthGuard("jwt"))
export class ReposController {
  constructor(
    private readonly reposService: ReposService,
    private readonly gitRemoteService: GitRemoteService,
    private readonly gitOperationService: GitOperationService,
    private readonly branchService: BranchService,
    private readonly pullRequestService: PullRequestService,
    private readonly fileService: FileService,
  ) {}

  @ApiOperation({ summary: "새 레포지토리 생성" })
  @ApiResponse({
    status: 201,
    description: "레포지토리가 성공적으로 생성됨",
    type: Repo,
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRepo(
    @Body() createRepoDto: CreateRepoDto,
    @AuthUser() user: User,
  ): Promise<Repo> {
    return this.reposService.createRepo(createRepoDto, user.id);
  }

  @ApiOperation({ summary: "내 레포지토리 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "레포지토리 목록 반환",
    type: [Repo],
  })
  @Get()
  @HttpCode(HttpStatus.OK)
  async getMyRepos(@AuthUser() user: User): Promise<Repo[]> {
    return this.reposService.findReposByOwner(user.id);
  }

  @ApiOperation({ summary: "공개 레포지토리 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "공개 레포지토리 목록 반환",
    type: [Repo],
  })
  @Get("public")
  @HttpCode(HttpStatus.OK)
  async getPublicRepos(): Promise<Repo[]> {
    return this.reposService.findPublicRepos();
  }

  @ApiOperation({ summary: "특정 사용자의 공개 레포지토리 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "사용자의 공개 레포지토리 목록 반환",
    type: [Repo],
  })
  @Get("public/user/:userId")
  @HttpCode(HttpStatus.OK)
  async getPublicReposByUser(
    @Param("userId") userId: string,
  ): Promise<Repo[]> {
    return this.reposService.findPublicReposByOwner(userId);
  }

  @ApiOperation({ summary: "레포지토리 Fork" })
  @ApiResponse({
    status: 201,
    description: "레포지토리가 성공적으로 Fork됨",
    type: Repo,
  })
  @Post("fork")
  @HttpCode(HttpStatus.CREATED)
  async forkRepo(
    @Body() forkRepoDto: ForkRepoDto,
    @AuthUser() user: User,
  ): Promise<Repo> {
    return this.reposService.forkRepo(forkRepoDto, user.id);
  }

  @ApiOperation({ summary: "파일 스테이징" })
  @ApiResponse({ status: 200, description: "파일이 성공적으로 스테이징됨" })
  @Post(":repoId/add")
  @HttpCode(HttpStatus.OK)
  async addFiles(
    @Param("repoId") repoId: string,
    @Body() addDto: AddDto,
    @AuthUser() user: User,
  ) {
    return this.gitOperationService.addFiles(repoId, user.id, addDto.files);
  }

  @ApiOperation({ summary: "변경사항 커밋" })
  @ApiResponse({ status: 200, description: "커밋이 성공적으로 생성됨" })
  @Post(":repoId/commit")
  @HttpCode(HttpStatus.OK)
  async commit(
    @Param("repoId") repoId: string,
    @Body() commitDto: CommitDto,
    @AuthUser() user: User,
  ) {
    return this.gitOperationService.commit(
      repoId,
      user.id,
      commitDto.message,
      commitDto.branch,
    );
  }

  @ApiOperation({ summary: "리모트 저장소 등록" })
  @ApiResponse({ status: 204, description: "리모트가 성공적으로 등록됨" })
  @Post(":repoId/remote")
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerRemote(
    @Param("repoId") repoId: string,
    @Body() addRemoteDto: AddRemoteDto,
    @AuthUser() user: User,
  ) {
    await this.gitRemoteService.addRemote(
      repoId,
      user.id,
      addRemoteDto.url,
      addRemoteDto.name,
    );
  }

  @ApiOperation({ summary: "원격 저장소에서 Pull" })
  @ApiResponse({ status: 200, description: "Pull이 성공적으로 완료됨" })
  @Post(":repoId/pull")
  @HttpCode(HttpStatus.OK)
  pull(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() pullDto: PullDto,
  ) {
    return this.gitRemoteService.pullRepo(
      repoId,
      user.id,
      pullDto.remote,
      pullDto.branch,
      pullDto.ffOnly,
    );
  }

  @ApiOperation({ summary: "저장소 상태 조회" })
  @ApiResponse({ status: 200, description: "저장소 상태 반환" })
  @Get(":repoId/status")
  async getStatus(@Param("repoId") repoId: string, @AuthUser() user: User) {
    const files = await this.gitOperationService.status(repoId, user.id);
    return { files };
  }

  @ApiOperation({ summary: "원격 저장소로 Push" })
  @ApiResponse({ status: 200, description: "Push가 성공적으로 완료됨" })
  @Post(":repoId/push")
  @HttpCode(HttpStatus.OK)
  async push(
    @Param("repoId") repoId: string,
    @Body() pushDto: PushDto,
    @AuthUser() user: User,
  ) {
    return this.gitRemoteService.pushRepo(
      repoId,
      user.id,
      pushDto.remote,
      pushDto.branch,
    );
  }

  @ApiOperation({ summary: "브랜치 목록 조회" })
  @ApiResponse({ status: 200, description: "브랜치 목록 및 최근 커밋 반환" })
  @Get(":repoId/branches")
  @HttpCode(HttpStatus.OK)
  async listBranches(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("limit") limit?: string,
  ) {
    const commitLimit = limit ? Number(limit) : 20;
    return this.branchService.getBranches(repoId, user.id, commitLimit);
  }

  @ApiOperation({ summary: "커밋 그래프 조회" })
  @ApiResponse({ status: 200, description: "커밋 그래프 반환" })
  @Get(":repoId/graph")
  @HttpCode(HttpStatus.OK)
  async graph(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("since") since?: string,
    @Query("max") max?: string,
  ) {
    return this.branchService.getGraph(
      repoId,
      user.id,
      since,
      Number(max) || 200,
    );
  }

  @ApiOperation({ summary: "로컬 리모트 저장소 생성" })
  @ApiResponse({ status: 201, description: "로컬 리모트가 성공적으로 생성됨" })
  @Post(":repoId/remote-local")
  @HttpCode(HttpStatus.CREATED)
  async createLocalRemote(
    @Param("repoId") repoId: string,
    @Body() createLocalRemoteDto: CreateLocalRemoteDto,
    @AuthUser() user: User,
  ) {
    const remoteInfo = await this.gitRemoteService.createLocalRemote(
      repoId,
      user.id,
      createLocalRemoteDto.name,
    );
    return {
      success: true,
      remotePath: remoteInfo.path,
      remoteName: remoteInfo.name,
    };
  }

  @ApiOperation({ summary: "새 브랜치 생성" })
  @ApiResponse({ status: 201, description: "브랜치가 성공적으로 생성됨" })
  @Post(":repoId/branches")
  @HttpCode(HttpStatus.CREATED)
  async createBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() createBranchDto: CreateBranchDto,
  ) {
    return this.branchService.createBranch(
      repoId,
      user.id,
      createBranchDto.name,
      createBranchDto.from,
    );
  }

  @ApiOperation({ summary: "브랜치 전환" })
  @ApiResponse({ status: 200, description: "브랜치가 성공적으로 전환됨" })
  @Post(":repoId/branches/switch")
  @HttpCode(HttpStatus.OK)
  async switchBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() switchBranchDto: SwitchBranchDto,
  ) {
    return this.branchService.switchBranch(repoId, user.id, switchBranchDto.name);
  }

  @ApiOperation({ summary: "브랜치 삭제" })
  @ApiResponse({ status: 200, description: "브랜치가 성공적으로 삭제됨" })
  @Delete(":repoId/branches/:branchName")
  @HttpCode(HttpStatus.OK)
  async deleteBranch(
    @Param("repoId") repoId: string,
    @Param("branchName") branchName: string,
    @AuthUser() user: User,
  ) {
    return this.branchService.deleteBranch(repoId, user.id, branchName);
  }

  @ApiOperation({ summary: "브랜치 병합" })
  @ApiResponse({ status: 200, description: "브랜치가 성공적으로 병합됨" })
  @Post(":repoId/merge")
  @HttpCode(HttpStatus.OK)
  async mergeBranch(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() mergeBranchDto: MergeBranchDto,
  ) {
    return this.branchService.mergeBranch(
      repoId,
      user.id,
      mergeBranchDto.sourceBranch,
      mergeBranchDto.targetBranch,
      mergeBranchDto.fastForwardOnly || false,
    );
  }

  @ApiOperation({ summary: "Pull Request 생성" })
  @ApiResponse({ status: 201, description: "Pull Request가 성공적으로 생성됨" })
  @Post(":repoId/pull-requests")
  @HttpCode(HttpStatus.CREATED)
  async createPullRequest(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() createPullRequestDto: CreatePullRequestDto,
  ) {
    return this.pullRequestService.createPullRequest(
      repoId,
      user.id,
      createPullRequestDto,
    );
  }

  @ApiOperation({ summary: "Pull Request 목록 조회" })
  @ApiResponse({ status: 200, description: "Pull Request 목록 반환" })
  @Get(":repoId/pull-requests")
  @HttpCode(HttpStatus.OK)
  async getPullRequests(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("status") status?: PullRequestStatus,
  ) {
    return this.pullRequestService.getPullRequests(repoId, user.id, status);
  }

  @ApiOperation({ summary: "Pull Request 상세 조회" })
  @ApiResponse({ status: 200, description: "Pull Request 상세 정보 반환" })
  @Get(":repoId/pull-requests/:prId")
  @HttpCode(HttpStatus.OK)
  async getPullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.pullRequestService.getPullRequest(repoId, user.id, prId);
  }

  @ApiOperation({ summary: "Pull Request 병합" })
  @ApiResponse({ status: 200, description: "Pull Request가 성공적으로 병합됨" })
  @Post(":repoId/pull-requests/:prId/merge")
  @HttpCode(HttpStatus.OK)
  async mergePullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Body() mergePullRequestDto?: MergePullRequestDto,
  ) {
    return this.pullRequestService.mergePullRequest(
      repoId,
      user.id,
      prId,
      mergePullRequestDto?.fastForwardOnly || false,
    );
  }

  @ApiOperation({ summary: "Pull Request 닫기" })
  @ApiResponse({ status: 200, description: "Pull Request가 성공적으로 닫힘" })
  @Post(":repoId/pull-requests/:prId/close")
  @HttpCode(HttpStatus.OK)
  async closePullRequest(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.pullRequestService.closePullRequest(repoId, user.id, prId);
  }

  @ApiOperation({ summary: "Pull Request 리뷰 작성" })
  @ApiResponse({ status: 201, description: "리뷰가 성공적으로 작성됨" })
  @Post(":repoId/pull-requests/:prId/reviews")
  @HttpCode(HttpStatus.CREATED)
  async createReview(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
    @Body() createReviewDto: CreateReviewDto,
  ) {
    return this.pullRequestService.createReview(
      repoId,
      user.id,
      prId,
      createReviewDto,
    );
  }

  @ApiOperation({ summary: "Pull Request 리뷰 목록 조회" })
  @ApiResponse({ status: 200, description: "리뷰 목록 반환" })
  @Get(":repoId/pull-requests/:prId/reviews")
  @HttpCode(HttpStatus.OK)
  async getReviews(
    @Param("repoId") repoId: string,
    @Param("prId") prId: string,
    @AuthUser() user: User,
  ) {
    return this.pullRequestService.getReviews(repoId, user.id, prId);
  }

  // 파일 관리 API들
  @ApiOperation({ summary: "파일 브라우징 및 파일 내용 조회" })
  @ApiResponse({
    status: 200,
    description: "파일/폴더 목록 또는 파일 내용 반환",
  })
  @Get(":repoId/files")
  @HttpCode(HttpStatus.OK)
  async browseFiles(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("path") filePath?: string,
  ) {
    return this.fileService.browseFiles(repoId, user.id, filePath);
  }

  @ApiOperation({
    summary: "파일 생성 또는 업로드",
    description: "Content-Type에 따라 다르게 동작합니다.\n\n- application/json: 텍스트 파일 생성\n- multipart/form-data: 바이너리 파일 업로드"
  })
  @ApiResponse({ status: 201, description: "파일이 성공적으로 생성/업로드됨" })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: 'object',
          title: 'JSON - 텍스트 파일 생성',
          properties: {
            filename: { type: 'string', example: 'test.txt', description: '생성할 파일명' },
            content: { type: 'string', example: 'Hello World', description: '파일 내용' },
            path: { type: 'string', example: 'src', description: '파일 경로 (선택사항)' },
            overwrite: { type: 'boolean', example: false, description: '덮어쓰기 허용 여부' },
          },
          required: ['filename', 'content'],
        },
        {
          type: 'object',
          title: 'Multipart - 파일 업로드',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
              description: '업로드할 파일들 (최대 10개, 각 10MB 제한)',
            },
            path: { type: 'string', example: 'uploads', description: '업로드 경로 (선택사항)' },
            overwrite: { type: 'boolean', example: false, description: '덮어쓰기 허용 여부' },
          },
          required: ['files'],
        },
      ],
    },
  })
  @Post(":repoId/files")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('files', 10, {
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB 제한
  }))
  async createOrUploadFile(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @UploadedFiles() files?: Express.Multer.File[],
    @Body() body?: any,
  ) {
    if (files && files.length > 0) {
      const uploadPath = body?.path || "";
      const overwrite = Boolean(body?.overwrite) || String(body?.overwrite) === 'true';

      return this.fileService.uploadFiles(
        repoId,
        user.id,
        files,
        uploadPath,
        overwrite,
      );
    }

    // application/json으로 텍스트 파일 생성
    const createFileDto = body as CreateFileDto;
    return this.fileService.createFile(
      repoId,
      user.id,
      createFileDto.filename,
      createFileDto.content,
      createFileDto.path,
      createFileDto.overwrite,
    );
  }

  @ApiOperation({ summary: "파일 내용 수정" })
  @ApiResponse({ status: 200, description: "파일이 성공적으로 수정됨" })
  @Patch(":repoId/files")
  @HttpCode(HttpStatus.OK)
  async updateFile(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() updateFileDto: UpdateFileDto,
  ) {
    return this.fileService.updateFile(
      repoId,
      user.id,
      updateFileDto.path,
      updateFileDto.content,
    );
  }

  @ApiOperation({ summary: "파일 또는 폴더 삭제" })
  @ApiResponse({ status: 200, description: "파일/폴더가 성공적으로 삭제됨" })
  @Delete(":repoId/files")
  @HttpCode(HttpStatus.OK)
  async deleteFile(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query("path") filePath: string,
  ) {
    return this.fileService.deleteFile(repoId, user.id, filePath);
  }

}
