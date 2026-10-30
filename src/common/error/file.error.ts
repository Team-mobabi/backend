import { Data } from "effect";

export class FileNotFoundError extends Data.TaggedError("FileNotFoundError")<{
  message: string;
  path: string;
}> {}

export class FileAlreadyExistsError extends Data.TaggedError(
  "FileAlreadyExistsError",
)<{
  message: string;
  path: string;
}> {}

export class FileValidationError extends Data.TaggedError(
  "FileValidationError",
)<{
  message: string;
}> {}

export class FileSystemError extends Data.TaggedError("FileSystemError")<{
  message: string;
  originalError: unknown;
}> {}

export type FileError =
  | FileNotFoundError
  | FileAlreadyExistsError
  | FileValidationError
  | FileSystemError;
