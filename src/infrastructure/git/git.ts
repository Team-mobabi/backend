import { Effect } from "effect";
import { GitOperationError } from "@src/common/error";

export const gitErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * simple-git 호출을 Effect로 감싼다.
 * git 원본 메시지에는 서버 경로가 섞일 수 있어 응답 메시지에는 넣지 않고 원인으로만 보관한다.
 */
export const tryGit = <T>(
  operation: string,
  fn: () => Promise<T>,
): Effect.Effect<T, GitOperationError> =>
  Effect.tryPromise({
    try: fn,
    catch: (error) =>
      new GitOperationError({
        message: `Git operation '${operation}' failed`,
        operation,
        originalError: error,
      }),
  });

/** 실패 메시지를 보고 도메인 에러로 바꿀 수 있는 경우를 처리 */
export const recoverGit =
  <E>(match: (message: string) => E | undefined) =>
  <A, R>(
    self: Effect.Effect<A, GitOperationError, R>,
  ): Effect.Effect<A, GitOperationError | E, R> =>
    Effect.mapError(self, (error): GitOperationError | E => {
      const mapped = match(gitErrorMessage(error.originalError));
      return mapped === undefined ? error : mapped;
    });

export const currentBranch = (git: {
  revparse: (args: string[]) => Promise<string>;
}): Effect.Effect<string, GitOperationError> =>
  tryGit("rev-parse", () => git.revparse(["--abbrev-ref", "HEAD"])).pipe(
    Effect.map((name) => name.trim()),
  );

export const headHash = (git: {
  revparse: (args: string[]) => Promise<string>;
}): Effect.Effect<string, GitOperationError> =>
  tryGit("rev-parse", () => git.revparse(["HEAD"])).pipe(
    Effect.map((hash) => hash.trim()),
  );
