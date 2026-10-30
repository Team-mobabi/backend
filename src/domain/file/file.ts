import { Schema } from "effect";
import { NonRootRepoPathSchema, ROOT_PATH, RepoPathSchema } from "./repo-path";

const BooleanFromString = Schema.transform(
  Schema.Literal("true", "false"),
  Schema.Boolean,
  {
    strict: true,
    decode: (value) => value === "true",
    encode: (value) => (value ? "true" : "false"),
  },
);

// ── 응답 ──

const EntryFields = {
  name: Schema.String,
  path: Schema.String,
  size: Schema.Number,
  modifiedAt: Schema.Date,
};

export const FileItemSchema = Schema.Struct({
  ...EntryFields,
  type: Schema.Literal("file"),
});
export type FileItem = Schema.Schema.Type<typeof FileItemSchema>;

export const FolderItemSchema = Schema.Struct({
  ...EntryFields,
  type: Schema.Literal("folder"),
});
export type FolderItem = Schema.Schema.Type<typeof FolderItemSchema>;

export const DirectoryContentSchema = Schema.Struct({
  type: Schema.Literal("directory"),
  folders: Schema.Array(FolderItemSchema),
  files: Schema.Array(FileItemSchema),
  currentPath: Schema.String,
});
export type DirectoryContent = Schema.Schema.Type<
  typeof DirectoryContentSchema
>;

export const TextFileContentSchema = Schema.Struct({
  type: Schema.Literal("file"),
  content: Schema.String,
  size: Schema.Number,
  path: Schema.String,
  modifiedAt: Schema.Date,
});
export type TextFileContent = Schema.Schema.Type<typeof TextFileContentSchema>;

export const BinaryFileInfoSchema = Schema.Struct({
  type: Schema.Literal("binary"),
  size: Schema.Number,
  path: Schema.String,
  modifiedAt: Schema.Date,
});
export type BinaryFileInfo = Schema.Schema.Type<typeof BinaryFileInfoSchema>;

export const FileBrowseResultSchema = Schema.Union(
  DirectoryContentSchema,
  TextFileContentSchema,
  BinaryFileInfoSchema,
);
export type FileBrowseResult = Schema.Schema.Type<
  typeof FileBrowseResultSchema
>;

export const FileWriteResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  filename: Schema.optional(Schema.String),
  path: Schema.String,
  size: Schema.Number,
  modifiedAt: Schema.Date,
});
export type FileWriteResult = Schema.Schema.Type<typeof FileWriteResultSchema>;

export const FileDeleteResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  deletedPath: Schema.String,
  type: Schema.Literal("file", "folder"),
});
export type FileDeleteResult = Schema.Schema.Type<
  typeof FileDeleteResultSchema
>;

export const UploadedFileInfoSchema = Schema.Struct({
  originalname: Schema.String,
  filename: Schema.String,
  path: Schema.String,
  size: Schema.Number,
  mimetype: Schema.String,
  modifiedAt: Schema.Date,
});
export type UploadedFileInfo = Schema.Schema.Type<
  typeof UploadedFileInfoSchema
>;

export const UploadResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  uploadedFiles: Schema.Array(UploadedFileInfoSchema),
  uploadPath: Schema.String,
  ignoredFiles: Schema.optional(Schema.Array(Schema.String)),
  ignoredCount: Schema.optional(Schema.Number),
  message: Schema.optional(Schema.String),
});
export type UploadResult = Schema.Schema.Type<typeof UploadResultSchema>;

// ── 요청 ──

export const BrowseFilesQuerySchema = Schema.Struct({
  path: Schema.optionalWith(RepoPathSchema, { default: () => ROOT_PATH }),
});

export const FilePathQuerySchema = Schema.Struct({
  path: NonRootRepoPathSchema,
});

export const CreateFileBodySchema = Schema.Struct({
  filename: NonRootRepoPathSchema.annotations({
    description: "생성할 파일명 (하위 폴더 포함 가능)",
  }),
  content: Schema.String.annotations({ description: "파일 내용" }),
  path: Schema.optionalWith(RepoPathSchema, { default: () => ROOT_PATH }),
  overwrite: Schema.optionalWith(Schema.Boolean, { default: () => false }),
});
export type CreateFileBody = Schema.Schema.Type<typeof CreateFileBodySchema>;

export const UpdateFileBodySchema = Schema.Struct({
  path: NonRootRepoPathSchema,
  content: Schema.String,
});
export type UpdateFileBody = Schema.Schema.Type<typeof UpdateFileBodySchema>;

/** multipart 필드는 모두 문자열로 들어온다 */
export const UploadFilesBodySchema = Schema.Struct({
  path: Schema.optionalWith(RepoPathSchema, { default: () => ROOT_PATH }),
  overwrite: Schema.optionalWith(BooleanFromString, { default: () => true }),
  // 폴더 업로드 시 파일별 상대 경로. 비어 있는 항목은 원본 파일명을 사용
  paths: Schema.optionalWith(
    Schema.Union(
      Schema.Array(RepoPathSchema),
      Schema.transform(
        RepoPathSchema,
        Schema.Array(Schema.typeSchema(RepoPathSchema)),
        {
          strict: true,
          decode: (single) => [single],
          encode: ([single]) => single,
        },
      ),
    ),
    { default: () => [] },
  ),
});
export type UploadFilesBody = Schema.Schema.Type<typeof UploadFilesBodySchema>;
