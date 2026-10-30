import { Data } from "effect";

export class PullRequestNotFoundError extends Data.TaggedError(
  "PullRequestNotFoundError",
)<{
  message: string;
}> {}

/** 상태/승인/중복 등으로 요청한 작업을 할 수 없는 경우 */
export class PullRequestConflictError extends Data.TaggedError(
  "PullRequestConflictError",
)<{
  message: string;
}> {}

export type PullRequestError =
  | PullRequestNotFoundError
  | PullRequestConflictError;
