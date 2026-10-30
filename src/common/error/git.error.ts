import { Data } from "effect";

/** 응답 본문에 함께 내려줄 추가 정보 (기존 API의 reason/hint/resolution 등) */
type Details = Readonly<Record<string, unknown>>;

export class GitOperationError extends Data.TaggedError("GitOperationError")<{
  message: string;
  operation: string;
  originalError: unknown;
}> {}

export class GitConflictError extends Data.TaggedError("GitConflictError")<{
  message: string;
  details?: Details;
}> {}

/** 커밋되지 않은 변경사항 등 작업을 시작할 수 없는 상태 */
export class GitPreconditionError extends Data.TaggedError(
  "GitPreconditionError",
)<{
  message: string;
  details?: Details;
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
  | GitPreconditionError
  | GitRefNotFoundError;
