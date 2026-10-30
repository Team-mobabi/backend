import { Data } from "effect";

export class GitOperationError extends Data.TaggedError("GitOperationError")<{
  message: string;
  operation: string;
  originalError: unknown;
}> {}

export class GitConflictError extends Data.TaggedError("GitConflictError")<{
  message: string;
  conflictedFiles: readonly string[];
}> {}

export class GitRefNotFoundError extends Data.TaggedError(
  "GitRefNotFoundError",
)<{
  message: string;
  ref: string;
}> {}

export type GitError =
  | GitOperationError
  | GitConflictError
  | GitRefNotFoundError;
