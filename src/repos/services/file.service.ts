import { Injectable } from "@nestjs/common";
import {
  FileNotFoundException,
  FileAlreadyExistsException,
  PathIsDirectoryException,
  FilenameTooLongException,
} from "@src/repos/exceptions/repo.exceptions";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Repo } from "@src/repos/entities/repo.entity";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import * as path from "node:path";
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
  private readonly MAX_FILENAME_BYTES = 200; // Linux 파일시스템 255바이트 제한, 안전하게 200바이트로 설정

  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    configService: ConfigService,
  ) {
    super(repoRepository, configService);
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
    const { repo } = await this.getRepoAndGit(repoId, userId);

    const targetPath = path.join(repo.gitPath, filePath);

    try {
      const stats = await fs.stat(targetPath);

      if (stats.isFile()) {
        return this.getFileContent(repo.gitPath, filePath);
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
    // 파일명 길이 검증
    this.validateFilename(filename);

    const { repo } = await this.getRepoAndGit(repoId, userId);

    const targetDir = path.join(repo.gitPath, filePath);
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
    const { repo } = await this.getRepoAndGit(repoId, userId);

    const fullPath = path.join(repo.gitPath, filePath);

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
    const { repo } = await this.getRepoAndGit(repoId, userId);

    const fullPath = path.join(repo.gitPath, filePath);

    try {
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true });
      } else {
        await fs.unlink(fullPath);
      }

      return {
        success: true,
        deletedPath: filePath,
        type: stats.isDirectory() ? ("folder" as const) : ("file" as const),
      } as FileDeleteResult;
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new FileNotFoundException(filePath);
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
  ): Promise<UploadResult> {
    // 모든 파일명 검증 (업로드 시작 전에 미리 검증)
    for (const file of files) {
      this.validateFilename(file.originalname);
    }

    const { repo } = await this.getRepoAndGit(repoId, userId);

    const targetDir = path.join(repo.gitPath, uploadPath);
    await this.ensureDirectoryExists(targetDir);

    const uploadedFiles: UploadedFileInfo[] = [];

    for (const file of files) {
      const targetFilePath = path.join(targetDir, file.originalname);

      if (!overwrite) {
        try {
          await fs.access(targetFilePath);
          throw new FileAlreadyExistsException(file.originalname);
        } catch (err) {
          if (err.code !== "ENOENT") throw err;
        }
      }

      await fs.writeFile(targetFilePath, file.buffer);

      const stats = await fs.stat(targetFilePath);
      uploadedFiles.push({
        originalname: file.originalname,
        filename: file.originalname,
        path: path.join(uploadPath, file.originalname).replace(/\\/g, "/"),
        size: stats.size,
        mimetype: file.mimetype,
        modifiedAt: stats.mtime,
      });
    }

    return {
      success: true,
      uploadedFiles,
      uploadPath,
    };
  }
}