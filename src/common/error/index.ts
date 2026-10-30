import type { AiError } from "./ai.error";
import type { AuthError } from "./auth.error";
import type { CollaboratorError } from "./collaborator.error";
import type { DbError } from "./db.error";
import type { EmailError } from "./email.error";
import type { FileError } from "./file.error";
import type { GitError } from "./git.error";
import type { ApiError } from "./http.error";
import type { RepoError } from "./repo.error";
import type { UserError } from "./user.error";

export * from "./ai.error";
export * from "./auth.error";
export * from "./collaborator.error";
export * from "./db.error";
export * from "./email.error";
export * from "./file.error";
export * from "./git.error";
export * from "./http.error";
export * from "./repo.error";
export * from "./user.error";

export type AppError =
  | AiError
  | AuthError
  | CollaboratorError
  | EmailError
  | UserError
  | DbError
  | FileError
  | GitError
  | ApiError
  | RepoError;
