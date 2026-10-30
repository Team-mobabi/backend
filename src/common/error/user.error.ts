import { Data } from "effect";

export class UserNotFoundError extends Data.TaggedError("UserNotFoundError")<{
  message: string;
}> {}

export type UserError = UserNotFoundError;
