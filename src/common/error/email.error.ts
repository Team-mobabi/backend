import { Data } from "effect";

export class VerificationCodeError extends Data.TaggedError(
  "VerificationCodeError",
)<{
  message: string;
}> {}

export class EmailDeliveryError extends Data.TaggedError("EmailDeliveryError")<{
  message: string;
  originalError: unknown;
}> {}

export type EmailError = VerificationCodeError | EmailDeliveryError;
