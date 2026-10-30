import { Data } from "effect";

export class DbQueryError extends Data.TaggedError("DbQueryError")<{
  message: string;
  originalError: unknown;
}> {}

export class DbValidationError extends Data.TaggedError("DbValidationError")<{
  message: string;
  details?: string;
}> {}

export type DbError = DbQueryError | DbValidationError;
