import { Data } from "effect";

export class RepoNotFoundError extends Data.TaggedError("RepoNotFoundError")<{
  message: string;
  repoId: string;
}> {}

export class RepoAccessDeniedError extends Data.TaggedError(
  "RepoAccessDeniedError",
)<{
  message: string;
  repoId: string;
}> {}

export type RepoError = RepoNotFoundError | RepoAccessDeniedError;
