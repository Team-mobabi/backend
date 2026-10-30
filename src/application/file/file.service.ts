import * as path from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { Effect, Option, Schema } from "effect";
import ignore, { type Ignore } from "ignore";
import {
  type FileError,
  FileAlreadyExistsError,
  FileValidationError,
} from "@src/common/error";
import type {
  CreateFileBody,
  DirectoryContent,
  FileBrowseResult,
  FileDeleteResult,
  FileItem,
  FileWriteResult,
  FolderItem,
  UpdateFileBody,
  UploadFilesBody,
  UploadResult,
  UploadedFileInfo,
} from "@src/domain/file/file";
import {
  NonRootRepoPathSchema,
  type RepoPath,
  RepoPathSchema,
  joinRepoPath,
} from "@src/domain/file/repo-path";
import * as fsx from "@src/infrastructure/file/file-system";
import { tryGit } from "@src/infrastructure/git/git";
import {
  type RepoWorkspace,
  RepoWorkspaceService,
  type WorkspaceError,
} from "@src/application/repo/repo-workspace.service";

export interface UploadedFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly buffer: Buffer;
}

export interface FileDownload {
  readonly filename: string;
  readonly size: number;
  readonly content: Buffer;
}

export interface RepositoryArchive {
  readonly filename: string;
  readonly root: string;
}

const GITIGNORE = Schema.decodeSync(RepoPathSchema)(".gitignore");

const isDirectoryError = (displayPath: string) =>
  new FileValidationError({ message: `'${displayPath}'은(는) 폴더입니다` });

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(private readonly workspaces: RepoWorkspaceService) {}

  browse(
    repoId: string,
    userId: string,
    target: RepoPath,
  ): Effect.Effect<FileBrowseResult, WorkspaceError> {
    return this.withPath(repoId, userId, target, ({ absolute }) =>
      fsx
        .stat(absolute, target)
        .pipe(
          Effect.flatMap((stats) =>
            stats.isDirectory()
              ? this.listDirectory(absolute, target)
              : this.readContent(absolute, target),
          ),
        ),
    );
  }

  create(
    repoId: string,
    userId: string,
    body: CreateFileBody,
  ): Effect.Effect<FileWriteResult, WorkspaceError> {
    const target = joinRepoPath(body.path, body.filename);
    return this.withPath(repoId, userId, target, ({ absolute }) =>
      (body.overwrite
        ? Effect.void
        : this.assertNotExists(absolute, target)
      ).pipe(
        Effect.zipRight(fsx.writeFile(absolute, target, body.content)),
        Effect.zipRight(fsx.stat(absolute, target)),
        Effect.map((stats) => ({
          success: true as const,
          filename: body.filename,
          path: target,
          size: stats.size,
          modifiedAt: stats.mtime,
        })),
      ),
    );
  }

  update(
    repoId: string,
    userId: string,
    body: UpdateFileBody,
  ): Effect.Effect<FileWriteResult, WorkspaceError> {
    return this.withPath(repoId, userId, body.path, ({ absolute }) =>
      fsx.stat(absolute, body.path).pipe(
        Effect.filterOrFail(
          (stats) => !stats.isDirectory(),
          () => isDirectoryError(body.path),
        ),
        Effect.zipRight(fsx.writeFile(absolute, body.path, body.content)),
        Effect.zipRight(fsx.stat(absolute, body.path)),
        Effect.map((stats) => ({
          success: true as const,
          path: body.path,
          size: stats.size,
          modifiedAt: stats.mtime,
        })),
      ),
    );
  }

  remove(
    repoId: string,
    userId: string,
    target: RepoPath,
  ): Effect.Effect<FileDeleteResult, WorkspaceError> {
    return this.withPath(repoId, userId, target, ({ absolute, workspace }) =>
      fsx.stat(absolute, target).pipe(
        Effect.tap(() => fsx.remove(absolute, target)),
        // 삭제 상태를 스테이징. 추적되지 않던 파일이면 실패하므로 경고만 남긴다
        Effect.tap(() =>
          tryGit("add", () => workspace.git.add(target)).pipe(
            Effect.catchAll((error) =>
              Effect.sync(() =>
                this.logger.warn(
                  `삭제 스테이징 실패 (${target}): ${String(error.originalError)}`,
                ),
              ),
            ),
          ),
        ),
        Effect.map((stats) => ({
          success: true as const,
          deletedPath: target,
          type: stats.isDirectory() ? ("folder" as const) : ("file" as const),
        })),
      ),
    );
  }

  upload(
    repoId: string,
    userId: string,
    files: readonly UploadedFile[],
    body: UploadFilesBody,
  ): Effect.Effect<UploadResult, WorkspaceError> {
    return Effect.gen(this, function* () {
      const relativePaths = yield* this.uploadRelativePaths(files, body.paths);
      const workspace = yield* this.workspaces.open(repoId, userId);
      const ignored = yield* this.loadGitignore(workspace.root);

      const planned = files.map((file, index) => {
        const relative = relativePaths[index];
        return { file, relative, target: joinRepoPath(body.path, relative) };
      });
      const accepted = planned.filter(
        ({ target }) => !ignored?.ignores(target),
      );
      const ignoredFiles = planned
        .filter(({ target }) => ignored?.ignores(target))
        .map(({ relative }) => relative);

      const resolved = yield* Effect.forEach(accepted, (item) =>
        fsx
          .resolveInside(workspace.root, item.target)
          .pipe(Effect.map((absolute) => ({ ...item, absolute }))),
      );

      // 일부만 쓰이고 중간에 실패하지 않도록 쓰기 전에 충돌을 모두 확인한다
      if (!body.overwrite) {
        yield* Effect.forEach(resolved, ({ absolute, target }) =>
          this.assertNotExists(absolute, target),
        );
      }

      const uploadedFiles = yield* Effect.forEach(
        resolved,
        ({ file, relative, target, absolute }) =>
          fsx.writeFile(absolute, target, file.buffer).pipe(
            Effect.zipRight(fsx.stat(absolute, target)),
            Effect.map(
              (stats): UploadedFileInfo => ({
                originalname: relative,
                filename: relative,
                path: target,
                size: stats.size,
                mimetype: file.mimetype,
                modifiedAt: stats.mtime,
              }),
            ),
          ),
      );

      return {
        success: true as const,
        uploadedFiles,
        uploadPath: body.path,
        ...(ignoredFiles.length > 0 && {
          ignoredFiles,
          ignoredCount: ignoredFiles.length,
          message: `${uploadedFiles.length}개 파일 업로드 완료, ${ignoredFiles.length}개 파일 제외(.gitignore)`,
        }),
      };
    });
  }

  download(
    repoId: string,
    userId: string,
    target: RepoPath,
  ): Effect.Effect<FileDownload, WorkspaceError> {
    return this.withPath(repoId, userId, target, ({ absolute }) =>
      fsx.stat(absolute, target).pipe(
        Effect.filterOrFail(
          (stats) => !stats.isDirectory(),
          () => isDirectoryError(target),
        ),
        Effect.zipWith(fsx.readFile(absolute, target), (stats, content) => ({
          filename: path.posix.basename(target),
          size: stats.size,
          content,
        })),
      ),
    );
  }

  archive(
    repoId: string,
    userId: string,
  ): Effect.Effect<RepositoryArchive, WorkspaceError> {
    return this.workspaces.open(repoId, userId).pipe(
      Effect.map(({ repo, root }) => ({
        filename: `${repo.name || repoId}.zip`,
        root,
      })),
    );
  }

  private withPath<A, E>(
    repoId: string,
    userId: string,
    target: RepoPath,
    use: (ctx: {
      workspace: RepoWorkspace;
      absolute: string;
    }) => Effect.Effect<A, E>,
  ): Effect.Effect<A, E | WorkspaceError> {
    return this.workspaces
      .open(repoId, userId)
      .pipe(
        Effect.flatMap((workspace) =>
          fsx
            .resolveInside(workspace.root, target)
            .pipe(Effect.flatMap((absolute) => use({ workspace, absolute }))),
        ),
      );
  }

  private listDirectory(
    absolute: string,
    current: RepoPath,
  ): Effect.Effect<DirectoryContent, FileError> {
    return fsx.readDir(absolute, current).pipe(
      Effect.map((entries) =>
        entries.filter((entry) => !entry.name.startsWith(".git")),
      ),
      Effect.flatMap((entries) =>
        Effect.forEach(entries, (entry) => {
          const entryPath = path.posix.join(current, entry.name);
          return fsx.stat(path.join(absolute, entry.name), entryPath).pipe(
            Effect.map((stats) => ({
              entry,
              item: {
                name: entry.name,
                path: entryPath,
                size: stats.size,
                modifiedAt: stats.mtime,
              },
            })),
          );
        }),
      ),
      Effect.map((items) => ({
        type: "directory" as const,
        folders: items
          .filter(({ entry }) => entry.isDirectory())
          .map(({ item }): FolderItem => ({ ...item, type: "folder" })),
        files: items
          .filter(({ entry }) => !entry.isDirectory())
          .map(({ item }): FileItem => ({ ...item, type: "file" })),
        currentPath: current,
      })),
    );
  }

  private readContent(
    absolute: string,
    target: RepoPath,
  ): Effect.Effect<FileBrowseResult, FileError> {
    return Effect.zipWith(
      fsx.stat(absolute, target),
      fsx.readFile(absolute, target),
      (stats, buffer): FileBrowseResult =>
        buffer.includes(0)
          ? {
              type: "binary",
              size: stats.size,
              path: target,
              modifiedAt: stats.mtime,
            }
          : {
              type: "file",
              content: buffer.toString("utf8"),
              size: stats.size,
              path: target,
              modifiedAt: stats.mtime,
            },
    );
  }

  private assertNotExists(
    absolute: string,
    target: RepoPath,
  ): Effect.Effect<void, FileError> {
    return fsx.statOption(absolute, target).pipe(
      Effect.flatMap((stats) =>
        Option.isSome(stats)
          ? Effect.fail(
              new FileAlreadyExistsError({
                message: `'${target}'이(가) 이미 존재합니다`,
                path: target,
              }),
            )
          : Effect.void,
      ),
    );
  }

  /** paths[i]가 있으면 폴더 업로드의 상대 경로를, 없으면 원본 파일명을 사용 */
  private uploadRelativePaths(
    files: readonly UploadedFile[],
    paths: readonly RepoPath[],
  ): Effect.Effect<RepoPath[], FileValidationError> {
    if (files.length === 0) {
      return Effect.fail(
        new FileValidationError({ message: "업로드할 파일이 없습니다" }),
      );
    }
    return Effect.forEach(files, (file, index) => {
      const explicit = paths[index];
      if (explicit) return Effect.succeed(explicit);
      return Schema.decodeUnknown(NonRootRepoPathSchema)(
        file.originalname,
      ).pipe(
        Effect.mapError(
          () =>
            new FileValidationError({
              message: `올바르지 않은 파일명입니다: ${file.originalname}`,
            }),
        ),
      );
    });
  }

  private loadGitignore(
    root: string,
  ): Effect.Effect<Ignore | undefined, FileError> {
    return fsx.statOption(path.join(root, GITIGNORE), GITIGNORE).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(undefined),
          onSome: () =>
            fsx
              .readFile(path.join(root, GITIGNORE), GITIGNORE)
              .pipe(Effect.map((content) => ignore().add(content.toString()))),
        }),
      ),
    );
  }
}
