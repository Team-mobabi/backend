import type { Dirent, Stats } from "node:fs";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Effect, Option } from "effect";
import {
  type FileError,
  FileAlreadyExistsError,
  FileNotFoundError,
  FileSystemError,
  FileValidationError,
} from "@src/common/error";
import type { RepoPath } from "@src/domain/file/repo-path";

const errnoOf = (error: unknown): string | undefined =>
  error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;

/** errno를 사용자에게 의미 있는 도메인 에러로 변환. 경로는 항상 레포 기준 상대 경로로 노출 */
const toFileError =
  (displayPath: string, action: string) =>
  (error: unknown): FileError => {
    switch (errnoOf(error)) {
      case "ENOENT":
        return new FileNotFoundError({
          message: `'${displayPath}'을(를) 찾을 수 없습니다`,
          path: displayPath,
        });
      case "EEXIST":
        return new FileAlreadyExistsError({
          message: `'${displayPath}'이(가) 이미 존재합니다`,
          path: displayPath,
        });
      case "ENOTDIR":
      case "EISDIR":
        return new FileValidationError({
          message: `'${displayPath}'의 파일/폴더 유형이 올바르지 않습니다`,
        });
      default:
        return new FileSystemError({
          message: `파일 ${action}에 실패했습니다: ${displayPath}`,
          originalError: error,
        });
    }
  };

const isInside = (root: string, target: string): boolean =>
  target === root || target.startsWith(root + path.sep);

const realpathOfNearestExisting = async (target: string): Promise<string> => {
  let current = target;
  for (;;) {
    try {
      return await fs.realpath(current);
    } catch (error) {
      const parent = path.dirname(current);
      if (errnoOf(error) !== "ENOENT" || parent === current) throw error;
      current = parent;
    }
  }
};

/**
 * 상대 경로를 루트 안의 절대 경로로 변환한다.
 * 문자열 검사만으로는 레포에 커밋된 심볼릭 링크(예: link -> /etc)를 막을 수 없어
 * 실제 경로(realpath)까지 루트 안에 있는지 확인한다.
 */
export const resolveInside = (
  root: string,
  relative: RepoPath,
): Effect.Effect<string, FileError> => {
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, relative);
  const escaped = new FileValidationError({
    message: "레포지토리 밖의 경로는 사용할 수 없습니다",
  });

  if (!isInside(absoluteRoot, target)) return Effect.fail(escaped);

  return Effect.tryPromise({
    try: () =>
      Promise.all([
        fs.realpath(absoluteRoot),
        realpathOfNearestExisting(target),
      ]),
    catch: toFileError(relative, "경로 확인"),
  }).pipe(
    Effect.flatMap(([realRoot, realTarget]) =>
      isInside(realRoot, realTarget)
        ? Effect.succeed(target)
        : Effect.fail(escaped),
    ),
  );
};

const attempt = <T>(
  displayPath: string,
  action: string,
  fn: () => Promise<T>,
): Effect.Effect<T, FileError> =>
  Effect.tryPromise({ try: fn, catch: toFileError(displayPath, action) });

export const stat = (
  absolute: string,
  displayPath: string,
): Effect.Effect<Stats, FileError> =>
  attempt(displayPath, "조회", () => fs.stat(absolute));

export const statOption = (
  absolute: string,
  displayPath: string,
): Effect.Effect<Option.Option<Stats>, FileError> =>
  stat(absolute, displayPath).pipe(
    Effect.map(Option.some),
    Effect.catchTag("FileNotFoundError", () => Effect.succeed(Option.none())),
  );

export const readFile = (
  absolute: string,
  displayPath: string,
): Effect.Effect<Buffer, FileError> =>
  attempt(displayPath, "읽기", () => fs.readFile(absolute));

export const readDir = (
  absolute: string,
  displayPath: string,
): Effect.Effect<Dirent[], FileError> =>
  attempt(displayPath, "목록 조회", () =>
    fs.readdir(absolute, { withFileTypes: true }),
  );

export const writeFile = (
  absolute: string,
  displayPath: string,
  data: string | Buffer,
): Effect.Effect<void, FileError> =>
  attempt(displayPath, "쓰기", async () => {
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, data);
  });

export const remove = (
  absolute: string,
  displayPath: string,
): Effect.Effect<void, FileError> =>
  attempt(displayPath, "삭제", () => fs.rm(absolute, { recursive: true }));

export const ensureDir = (
  absolute: string,
  displayPath: string,
): Effect.Effect<void, FileError> =>
  attempt(displayPath, "폴더 생성", () =>
    fs.mkdir(absolute, { recursive: true }).then(() => undefined),
  );
