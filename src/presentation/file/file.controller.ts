import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { create as createArchive } from "archiver";
import type { Response } from "express";
import { JwtAuthGuard } from "@src/infrastructure/auth/jwt-auth.guard";
import { FileService } from "@src/application/file/file.service";
import {
  BrowseFilesQuerySchema,
  CreateFileBodySchema,
  FileBrowseResultSchema,
  FileDeleteResultSchema,
  FilePathQuerySchema,
  FileWriteResultSchema,
  UpdateFileBodySchema,
  UploadFilesBodySchema,
  UploadResultSchema,
} from "@src/domain/file/file";
import { RepoIdSchema } from "@src/domain/repo/repo";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";
import { AuthUser } from "@src/presentation/auth/auth-user.decorator";
import type { User } from "@src/domain/user/user";
import {
  CREATE_OR_UPLOAD_DESCRIPTION,
  DOWNLOAD_FILE_DESCRIPTION,
  DOWNLOAD_REPOSITORY_DESCRIPTION,
} from "./file.docs";

const MAX_UPLOAD_FILES = 100;
const MAX_UPLOAD_FILE_SIZE = 10 * 1024 * 1024;

const pathQuery = (required: boolean) =>
  ApiQuery({
    name: "path",
    required,
    type: String,
    description: "레포지토리 루트 기준 상대 경로",
    example: required ? "README.md" : "src",
  });

@ApiTags("Files")
@ApiBearerAuth("JWT-auth")
@ApiParam({ name: "repoId", format: "uuid" })
@ApiResponse({
  status: 400,
  description: "잘못된 요청 또는 허용되지 않는 경로",
})
@ApiResponse({ status: 403, description: "레포지토리 접근 권한 없음" })
@ApiResponse({
  status: 404,
  description: "레포지토리 또는 파일을 찾을 수 없음",
})
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class FileController extends BaseController {
  protected readonly logger = new Logger(FileController.name);

  constructor(private readonly fileService: FileService) {
    super();
  }

  @ApiOperation({ summary: "파일 브라우징 및 파일 내용 조회" })
  @pathQuery(false)
  @ApiResponse({
    status: 200,
    description: "폴더면 목록, 텍스트 파일이면 내용, 바이너리면 메타데이터",
    schema: apiSchema(FileBrowseResultSchema),
  })
  @Get(":repoId/files")
  @HttpCode(HttpStatus.OK)
  browseFiles(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { path } = this.decode(BrowseFilesQuerySchema, query);
    return this.runEffect(
      this.fileService.browse(this.repoId(repoId), user.id, path),
    );
  }

  @ApiOperation({
    summary: "파일 생성 또는 업로드",
    description: CREATE_OR_UPLOAD_DESCRIPTION,
  })
  @ApiConsumes("application/json", "multipart/form-data")
  @ApiBody({
    schema: {
      oneOf: [
        {
          title: "JSON - 텍스트 파일 생성",
          ...apiSchema(CreateFileBodySchema),
        },
        {
          title: "Multipart - 파일 업로드",
          type: "object",
          required: ["files"],
          properties: {
            files: {
              type: "array",
              items: { type: "string", format: "binary" },
              description: `업로드할 파일들 (최대 ${MAX_UPLOAD_FILES}개, 각 10MB 제한)`,
            },
            ...apiSchema(UploadFilesBodySchema).properties,
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 201,
    description: "JSON이면 생성 결과, multipart면 업로드 결과",
    schema: {
      oneOf: [apiSchema(FileWriteResultSchema), apiSchema(UploadResultSchema)],
    },
  })
  @ApiResponse({
    status: 409,
    description: "이미 존재하는 파일 (overwrite=false)",
  })
  @Post(":repoId/files")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FilesInterceptor("files", MAX_UPLOAD_FILES, {
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE },
    }),
  )
  createOrUploadFile(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: unknown,
  ) {
    const id = this.repoId(repoId);

    if (files && files.length > 0) {
      const options = this.decode(UploadFilesBodySchema, body);
      return this.runEffect(
        this.fileService.upload(id, user.id, files, options),
      );
    }

    const data = this.decode(CreateFileBodySchema, body);
    return this.runEffect(this.fileService.create(id, user.id, data));
  }

  @ApiOperation({ summary: "파일 내용 수정" })
  @ApiBody({ schema: apiSchema(UpdateFileBodySchema) })
  @ApiResponse({
    status: 200,
    description: "파일이 성공적으로 수정됨",
    schema: apiSchema(FileWriteResultSchema),
  })
  @Patch(":repoId/files")
  @HttpCode(HttpStatus.OK)
  updateFile(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Body() body: unknown,
  ) {
    const data = this.decode(UpdateFileBodySchema, body);
    return this.runEffect(
      this.fileService.update(this.repoId(repoId), user.id, data),
    );
  }

  @ApiOperation({ summary: "파일 또는 폴더 삭제" })
  @pathQuery(true)
  @ApiResponse({
    status: 200,
    description: "파일/폴더가 성공적으로 삭제됨",
    schema: apiSchema(FileDeleteResultSchema),
  })
  @Delete(":repoId/files")
  @HttpCode(HttpStatus.OK)
  deleteFile(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
  ) {
    const { path } = this.decode(FilePathQuerySchema, query);
    return this.runEffect(
      this.fileService.remove(this.repoId(repoId), user.id, path),
    );
  }

  @ApiOperation({
    summary: "파일 다운로드",
    description: DOWNLOAD_FILE_DESCRIPTION,
  })
  @pathQuery(true)
  @ApiResponse({
    status: 200,
    description: "파일 다운로드 성공",
    content: {
      "application/octet-stream": {
        schema: { type: "string", format: "binary" },
      },
    },
  })
  @Get(":repoId/files/download")
  async downloadFile(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Query() query: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const { path } = this.decode(FilePathQuerySchema, query);
    const file = await this.runEffect(
      this.fileService.download(this.repoId(repoId), user.id, path),
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.filename)}"`,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", file.size);
    res.send(file.content);
  }

  @ApiOperation({
    summary: "저장소 전체 다운로드",
    description: DOWNLOAD_REPOSITORY_DESCRIPTION,
  })
  @ApiResponse({
    status: 200,
    description: "저장소 zip 다운로드 성공",
    content: {
      "application/zip": {
        schema: { type: "string", format: "binary" },
      },
    },
  })
  @ApiResponse({ status: 500, description: "압축 파일 생성 실패" })
  @Get(":repoId/download")
  async downloadRepository(
    @Param("repoId") repoId: string,
    @AuthUser() user: User,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, root } = await this.runEffect(
      this.fileService.archive(this.repoId(repoId), user.id),
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.setHeader("Content-Type", "application/zip");

    const archive = createArchive("zip", { zlib: { level: 9 } });
    // 스트리밍이 시작된 뒤에는 JSON 에러 응답을 보낼 수 없으므로 연결을 끊는다
    archive.on("error", (error) => {
      this.logger.error(`압축 실패 (repoId: ${repoId})`, error);
      res.destroy(error);
    });
    archive.pipe(res);
    archive.glob("**/*", {
      cwd: root,
      ignore: [".git/**", ".git"],
      dot: true,
    });
    await archive.finalize();
  }

  private repoId(raw: string): string {
    return this.decode(RepoIdSchema, raw);
  }
}
