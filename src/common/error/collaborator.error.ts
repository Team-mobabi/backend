import { Data } from "effect";

export class CollaboratorConflictError extends Data.TaggedError(
  "CollaboratorConflictError",
)<{
  message: string;
}> {}

export class CollaboratorNotFoundError extends Data.TaggedError(
  "CollaboratorNotFoundError",
)<{
  message: string;
}> {}

export type CollaboratorError =
  | CollaboratorConflictError
  | CollaboratorNotFoundError;
