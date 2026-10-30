import { Data } from "effect";

export class AiUnavailableError extends Data.TaggedError("AiUnavailableError")<{
  message: string;
}> {}

export class AiResponseError extends Data.TaggedError("AiResponseError")<{
  message: string;
  originalError: unknown;
}> {}

export type AiError = AiUnavailableError | AiResponseError;
