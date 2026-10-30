import { Data } from "effect";

export class InvalidCredentialsError extends Data.TaggedError(
  "InvalidCredentialsError",
)<{
  message: string;
}> {}

export class InvalidRefreshTokenError extends Data.TaggedError(
  "InvalidRefreshTokenError",
)<{
  message: string;
}> {}

export class EmailAlreadyInUseError extends Data.TaggedError(
  "EmailAlreadyInUseError",
)<{
  message: string;
}> {}

export class EmailNotVerifiedError extends Data.TaggedError(
  "EmailNotVerifiedError",
)<{
  message: string;
}> {}

export type AuthError =
  | InvalidCredentialsError
  | InvalidRefreshTokenError
  | EmailAlreadyInUseError
  | EmailNotVerifiedError;
