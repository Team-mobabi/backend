import { posix } from "node:path";
import { Schema } from "effect";

// Linux 파일명 한도는 255바이트지만 UTF-8 한글 등을 고려해 여유를 둔다
export const MAX_SEGMENT_BYTES = 200;

const normalize = (raw: string): string => {
  const normalized = posix.normalize(raw.replace(/\\/g, "/"));
  if (normalized === "." || normalized === "./") return "";
  return normalized.replace(/^\.\//, "").replace(/\/+$/, "");
};

const validate = (value: string): string | undefined => {
  if (value.includes("\0")) return "경로에 NUL 문자를 포함할 수 없습니다";
  if (value.startsWith("/")) return "절대 경로는 사용할 수 없습니다";
  if (value === ".." || value.startsWith("../")) {
    return "레포지토리 밖의 경로는 사용할 수 없습니다";
  }
  const segments = value === "" ? [] : value.split("/");
  // .git 내부(hooks 등)에 쓰면 서버에서 git 명령 실행 시 임의 코드가 실행될 수 있다
  if (segments.includes(".git")) return ".git 경로는 접근할 수 없습니다";
  const tooLong = segments.find(
    (segment) => Buffer.byteLength(segment, "utf8") > MAX_SEGMENT_BYTES,
  );
  if (tooLong !== undefined) {
    return `파일/폴더 이름은 ${MAX_SEGMENT_BYTES}바이트를 넘을 수 없습니다: ${tooLong}`;
  }
  return undefined;
};

/**
 * 레포지토리 루트 기준 상대 경로. 정규화 후 검증되며 빈 문자열은 루트를 뜻한다.
 * 브랜드 타입이라 디코딩을 거치지 않은 문자열은 파일 시스템 계층에 넘길 수 없다.
 */
export const RepoPathSchema = Schema.transform(Schema.String, Schema.String, {
  strict: true,
  decode: normalize,
  encode: (value) => value,
}).pipe(
  Schema.filter((value) => validate(value)),
  Schema.brand("RepoPath"),
  Schema.annotations({
    description: "레포지토리 루트 기준 상대 경로",
  }),
);
export type RepoPath = Schema.Schema.Type<typeof RepoPathSchema>;

/** 루트를 가리킬 수 없는 경로 (삭제/수정 대상) */
export const NonRootRepoPathSchema = RepoPathSchema.pipe(
  Schema.filter((value) =>
    value === "" ? "루트 경로는 대상으로 지정할 수 없습니다" : undefined,
  ),
);

export const ROOT_PATH: RepoPath = Schema.decodeSync(RepoPathSchema)("");

/** 검증된 경로끼리 합친 결과도 다시 검증한다 */
export const joinRepoPath = (base: RepoPath, child: RepoPath): RepoPath =>
  Schema.decodeSync(RepoPathSchema)(posix.join(base, child));
