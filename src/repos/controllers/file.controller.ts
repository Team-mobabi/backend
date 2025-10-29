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
import { JwtAuthGuard } from "@src/auth/guards/jwt-auth.guard";
import { FileService } from "@src/repos/services/file.service";
import {
  CreateFileDto,
  UpdateFileDto,
} from "@src/repos/dto/file-operation.dto";
import { User } from "@src/users/entities/user.entity";
import { AuthUser } from "@src/repos/auth-user.decorator";

@ApiTags("Files")
@ApiBearerAuth("JWT-auth")
@Controller("repos")
@UseGuards(JwtAuthGuard)
export class FileController {
  constructor(private readonly fileService: FileService) {}

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
    description: `Content-Type에 따라 다르게 동작합니다.

**방법 1: 텍스트 파일 생성 (application/json)**
\`\`\`json
POST /repos/:repoId/files
Content-Type: application/json

{
  "filename": "README.md",
  "content": "# Hello World",
  "path": "docs",
  "overwrite": false
}
\`\`\`

**방법 2: 파일 업로드 (multipart/form-data)**

📤 **단일 파일 업로드**
\`\`\`bash
curl -X POST "http://localhost:6101/repos/:repoId/files" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "files=@/path/to/image.png" \\
  -F "path=uploads" \\
  -F "overwrite=false"
\`\`\`

📤 **여러 파일 동시 업로드 (최대 100개)**
\`\`\`bash
curl -X POST "http://localhost:6101/repos/:repoId/files" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "files=@/path/to/file1.png" \\
  -F "files=@/path/to/file2.pdf" \\
  -F "files=@/path/to/file3.zip" \\
  -F "path=uploads" \\
  -F "overwrite=false"
\`\`\`

📮 **Postman에서 사용법:**
1. Body 탭 선택
2. form-data 선택
3. Key: "files", Type: File 선택 후 파일 선택
4. 여러 파일: 같은 Key "files"로 여러 행 추가
5. Key: "path" (선택), Value: "uploads"
6. Key: "overwrite" (선택), Value: "false"

🌐 **JavaScript (Fetch API)**
\`\`\`javascript
const formData = new FormData();
formData.append('files', file1);
formData.append('files', file2);  // 같은 키로 여러 개 추가
formData.append('files', file3);
formData.append('path', 'uploads');
formData.append('overwrite', 'false');

fetch('/repos/:repoId/files', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
  body: formData
});
\`\`\`

**제한:**
- 최대 100개 파일 동시 업로드
- 각 파일 최대 10MB
- .gitignore 패턴에 매칭되는 파일은 자동 제외
- 모든 파일 형식 지원 (이미지, PDF, ZIP 등)
`
  })
  @ApiResponse({
    status: 201,
    description: "파일이 성공적으로 생성/업로드됨",
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        uploadedFiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string', example: 'image.png' },
              path: { type: 'string', example: 'uploads/image.png' },
              size: { type: 'number', example: 1024000 },
              mimetype: { type: 'string', example: 'image/png' }
            }
          }
        }
      }
    }
  })
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
              description: '업로드할 파일들 (최대 100개, 각 10MB 제한)',
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
  @UseInterceptors(FilesInterceptor('files', 100, {
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
      const overwrite = body?.overwrite !== undefined
        ? (Boolean(body?.overwrite) || String(body?.overwrite) === 'true')
        : true; // 기본값을 true로 변경

      // paths 필드 받기 (배열 또는 단일 값)
      let paths: string[] = [];
      if (body?.paths) {
        paths = Array.isArray(body.paths) ? body.paths : [body.paths];
      }

      return this.fileService.uploadFiles(
        repoId,
        user.id,
        files,
        uploadPath,
        overwrite,
        paths,
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