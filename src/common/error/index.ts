import type { AiError } from "./ai.error";
import type { DbError } from "./db.error";
import type { FileError } from "./file.error";
import type { GitError } from "./git.error";
import type { ApiError } from "./http.error";
import type { RepoError } from "./repo.error";

export * from "./ai.error";
export * from "./db.error";
export * from "./file.error";
export * from "./git.error";
export * from "./http.error";
export * from "./repo.error";

export type AppError =
  | AiError
  | DbError
  | FileError
  | GitError
  | ApiError
  | RepoError;
