import { Effect } from "effect";
import { GitOperationError } from "@src/common/error";

export const tryGit = <T>(
  operation: string,
  fn: () => Promise<T>,
): Effect.Effect<T, GitOperationError> =>
  Effect.tryPromise({
    try: fn,
    catch: (error) =>
      new GitOperationError({
        message: `Git ${operation} 실패`,
        operation,
        originalError: error,
      }),
  });
