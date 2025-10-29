import { Injectable, Logger, HttpException, HttpStatus } from "@nestjs/common";
import {
  FileNotFoundException,
  FileAlreadyExistsException,
  PathIsDirectoryException,
  FilenameTooLongException,
} from "@src/repos/exceptions/repo.exceptions";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Repo } from "@src/repos/entities/repo.entity";
import { RepoCollaborator } from "@src/repos/entities/repo-collaborator.entity";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import ignore from "ignore";
import {
  FileItem,
  FolderItem,
  DirectoryContent,
  FileContent,
  BinaryFileInfo,
  UploadedFileInfo,
  UploadResult,
  FileOperationResult,
  FileDeleteResult,
  FileBrowseResult,
} from "@src/repos/interfaces/file-management.interface";
import { BaseRepoService } from "@src/repos/services/base-repo.service";

@Injectable()
export class FileService extends BaseRepoService {
  private readonly logger = new Logger(FileService.name);
  private readonly MAX_FILENAME_BYTES = 200; // Linux 파일시스템 255바이트 제한, 안전하게 200바이트로 설정

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
   * 파일명 길이 검증
   * @param filename 검증할 파일명
   * @throws FilenameTooLongException 파일명이 너무 긴 경우
   */
  private validateFilename(filename: string): void {
    const filenameBytes = Buffer.byteLength(filename, 'utf8');
    if (filenameBytes > this.MAX_FILENAME_BYTES) {
      throw new FilenameTooLongException(filename, this.MAX_FILENAME_BYTES, filenameBytes);
    }
  }

  async browseFiles(
    repoId: string,
    userId: string,
    filePath = "",
  ): Promise<FileBrowseResult> {
    const { repoPath } = await this.getRepoAndGit(repoId, userId);

    const targetPath = path.join(repoPath, filePath);

    try {
      const stats = await fs.stat(targetPath);

      if (stats.isFile()) {
        return this.getFileContent(repoPath, filePath);
      } else {
        const entries = await fs.readdir(targetPath, { withFileTypes: true });

        const files: FileItem[] = [];
        const folders: FolderItem[] = [];

        for (const entry of entries) {
          if (entry.name.startsWith(".git")) continue;

          const entryPath = path.join(targetPath, entry.name);
          const entryStats = await fs.stat(entryPath);

          const item = {
            name: entry.name,
            path: path.join(filePath, entry.name).replace(/\\/g, "/"),
            size: entryStats.size,
            modifiedAt: entryStats.mtime,
          };

          if (entry.isDirectory()) {
            folders.push({ ...item, type: "folder" });
          } else {
            files.push({ ...item, type: "file" });
          }
        }

        return {
          type: "directory" as const,
          folders,
          files,
          currentPath: filePath,
        } as DirectoryContent;
      }
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new FileNotFoundException(filePath);
      }
      throw err;
    }
  }

  private async getFileContent(
    repoPath: string,
    filePath: string,
  ): Promise<FileContent | BinaryFileInfo> {
    const fullPath = path.join(repoPath, filePath);

    try {
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        throw new PathIsDirectoryException(filePath);
      }

      const buffer = await fs.readFile(fullPath);
      const isBinary = buffer.indexOf(0) !== -1;

      if (isBinary) {
        return {
          type: "binary" as const,
          size: stats.size,
          path: filePath,
          modifiedAt: stats.mtime,
        } as BinaryFileInfo;
      }

      const content = buffer.toString("utf8");
      return {
        type: "file" as const,
        content,
        size: stats.size,
        path: filePath,
        modifiedAt: stats.mtime,
      } as FileContent;
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new FileNotFoundException(filePath);
      }
      throw err;
    }
  }

  async createFile(
    repoId: string,
    userId: string,
    filename: string,
    content: string,
    filePath = "",
    overwrite = false,
  ): Promise<FileOperationResult> {
    this.validateFilename(filename);

    const { repoPath } = await this.getRepoAndGit(repoId, userId);

    const targetDir = path.join(repoPath, filePath);
    await this.ensureDirectoryExists(targetDir);

    const fullFilePath = path.join(targetDir, filename);

    if (!overwrite) {
      try {
        await fs.access(fullFilePath);
        throw new FileAlreadyExistsException(filename);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    }

    await fs.writeFile(fullFilePath, content, "utf8");

    const stats = await fs.stat(fullFilePath);
    return {
      success: true,
      filename,
      path: path.join(filePath, filename).replace(/\\/g, "/"),
      size: stats.size,
      modifiedAt: stats.mtime,
    } as FileOperationResult;
  }

  async updateFile(
    repoId: string,
    userId: string,
    filePath: string,
    content: string,
  ): Promise<FileOperationResult> {
    const { repoPath } = await this.getRepoAndGit(repoId, userId);

    const fullPath = path.join(repoPath, filePath);

    try {
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        throw new PathIsDirectoryException(filePath);
      }
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new FileNotFoundException(filePath);
      }
      throw err;
    }

    await fs.writeFile(fullPath, content, "utf8");

    const stats = await fs.stat(fullPath);
    return {
      success: true,
      path: filePath,
      size: stats.size,
      modifiedAt: stats.mtime,
    } as FileOperationResult;
  }

  async deleteFile(
    repoId: string,
    userId: string,
    filePath: string,
  ): Promise<FileDeleteResult> {
    if (!filePath) {
      throw new HttpException("파일 경로가 필요합니다.", HttpStatus.BAD_REQUEST);
    }

    const { git, repoPath } = await this.getRepoAndGit(repoId, userId);

    const fullPath = path.join(repoPath, filePath);

    try {
      const stats = await fs.stat(fullPath);
      const isDirectory = stats.isDirectory();

      if (isDirectory) {
        await fs.rm(fullPath, { recursive: true });
      } else {
        await fs.unlink(fullPath);
      }

      // Git에 삭제 상태를 스테이징 (git add 또는 git rm)
      try {
        // git add는 삭제된 파일도 자동으로 스테이징합니다
        await git.add(filePath);
      } catch (gitError) {
        // git add가 실패하면 (이미 추적되지 않는 파일 등) 무시
        this.logger.warn(`Git add failed for ${filePath}: ${gitError.message}`);
      }

      return {
        success: true,
        deletedPath: filePath,
        type: isDirectory ? ("folder" as const) : ("file" as const),
      } as FileDeleteResult;
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new FileNotFoundException(filePath);
      }
      throw err;
    }
  }

  /**
   * .gitignore 파일을 읽고 ignore 인스턴스 생성
   */
  private async loadGitignore(repoPath: string): Promise<ReturnType<typeof ignore> | null> {
    try {
      const gitignorePath = path.join(repoPath, '.gitignore');
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
      const ig = ignore();
      ig.add(gitignoreContent);
      return ig;
    } catch (err) {
      // .gitignore 파일이 없으면 null 반환
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async uploadFiles(
    repoId: string,
    userId: string,
    files: Express.Multer.File[],
    uploadPath = "",
    overwrite = false,
    paths?: string[],
  ): Promise<UploadResult> {
    this.logger.debug(`uploadFiles 호출: filesCount=${files.length}, uploadPath=${uploadPath}, overwrite=${overwrite}, paths=${JSON.stringify(paths)}, fileOriginalNames=${JSON.stringify(files.map(f => f.originalname))}`);

    for (let i = 0; i < files.length; i++) {
      const filePathToValidate = paths && paths[i] ? paths[i] : files[i].originalname;
      this.logger.debug(`파일 ${i}: originalname=${files[i].originalname}, path=${paths?.[i]}, using=${filePathToValidate}`);
      this.validateFilename(filePathToValidate);
    }

    const { repoPath } = await this.getRepoAndGit(repoId, userId);

    const ig = await this.loadGitignore(repoPath);

    const filteredFiles: Array<{ file: Express.Multer.File; relativePath: string }> = [];
    const ignoredFiles: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relativePath = paths && paths[i] ? paths[i] : file.originalname;
      const relativeFilePath = path.join(uploadPath, relativePath).replace(/\\/g, "/");

      if (ig && ig.ignores(relativeFilePath)) {
        ignoredFiles.push(relativePath);
      } else {
        filteredFiles.push({ file, relativePath });
      }
    }

    const targetDir = path.join(repoPath, uploadPath);
    await this.ensureDirectoryExists(targetDir);

    const uploadedFiles: UploadedFileInfo[] = [];

    for (const { file, relativePath } of filteredFiles) {
      const fileDir = path.dirname(relativePath);
      const fileName = path.basename(relativePath);

      const fullTargetDir = path.join(targetDir, fileDir);
      await this.ensureDirectoryExists(fullTargetDir);

      const targetFilePath = path.join(fullTargetDir, fileName);

      if (!overwrite) {
        try {
          await fs.access(targetFilePath);
          throw new FileAlreadyExistsException(relativePath);
        } catch (err) {
          if (err.code !== "ENOENT") throw err;
        }
      }

      await fs.writeFile(targetFilePath, file.buffer);

      const stats = await fs.stat(targetFilePath);
      uploadedFiles.push({
        originalname: relativePath,
        filename: relativePath,
        path: path.join(uploadPath, relativePath).replace(/\\/g, "/"),
        size: stats.size,
        mimetype: file.mimetype,
        modifiedAt: stats.mtime,
      });
    }

    return {
      success: true,
      uploadedFiles,
      uploadPath,
      ...(ignoredFiles.length > 0 && {
        ignoredFiles,
        ignoredCount: ignoredFiles.length,
        message: `${uploadedFiles.length}개 파일 업로드 완료, ${ignoredFiles.length}개 파일 제외(.gitignore)`
      }),
    };
  }
}