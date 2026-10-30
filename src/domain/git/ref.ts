import { Schema } from "effect";

/**
 * 사용자 입력이 git 명령 인자로 그대로 들어가므로, "-"로 시작하는 값이
 * 옵션(--upload-pack=... 등)으로 해석되지 않도록 모든 ref 입력을 여기서 검증한다.
 */
const optionLike = (value: string) =>
  value.startsWith("-") ? "'-'로 시작할 수 없습니다" : undefined;

const hasControlChar = (value: string) =>
  [...value].some((ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

/** git check-ref-format 규칙의 실용적인 부분집합 */
const invalidBranchName = (value: string): string | undefined => {
  if (value.length === 0 || value.length > 255)
    return "길이가 올바르지 않습니다";
  if (hasControlChar(value) || /[\s~^:?*[\\]/.test(value)) {
    return "공백이나 ~ ^ : ? * [ \\ 문자를 포함할 수 없습니다";
  }
  if (value.includes("..") || value.includes("@{") || value === "@") {
    return "'..' 또는 '@{'를 포함할 수 없습니다";
  }
  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.endsWith(".lock") ||
    value.includes("//") ||
    value.split("/").some((part) => part.startsWith("."))
  ) {
    return "올바른 브랜치 이름 형식이 아닙니다";
  }
  return undefined;
};

export const BranchNameSchema = Schema.String.pipe(
  Schema.filter(optionLike),
  Schema.filter(invalidBranchName),
).annotations({ description: "브랜치 이름", examples: ["feature/login"] });
export type BranchName = Schema.Schema.Type<typeof BranchNameSchema>;

export const CommitHashSchema = Schema.String.pipe(
  Schema.pattern(/^[0-9a-fA-F]{4,40}$/, {
    message: () => "커밋 해시 형식이 올바르지 않습니다",
  }),
).annotations({ description: "커밋 해시", examples: ["abc1234"] });

/** 커밋 해시, 브랜치 이름, HEAD~1 같은 상대 표기 */
export const RevisionSchema = Schema.String.pipe(
  Schema.filter(optionLike),
  Schema.pattern(/^[A-Za-z0-9][A-Za-z0-9._/~^-]{0,254}$/, {
    message: () => "커밋/브랜치 표기 형식이 올바르지 않습니다",
  }),
  Schema.filter((value) =>
    value.includes("..") ? "'..'를 포함할 수 없습니다" : undefined,
  ),
).annotations({ description: "커밋 해시 또는 브랜치 이름" });
export type Revision = Schema.Schema.Type<typeof RevisionSchema>;

export const RemoteNameSchema = Schema.String.pipe(
  Schema.pattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/, {
    message: () => "리모트 이름 형식이 올바르지 않습니다",
  }),
).annotations({ description: "리모트 이름", examples: ["origin"] });

/** 외부 리모트는 http(s)만 허용 — file:// 등으로 다른 사용자의 저장소를 읽는 것을 막는다 */
export const RemoteUrlSchema = Schema.String.pipe(
  Schema.filter((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:"
        ? undefined
        : "http 또는 https URL만 사용할 수 있습니다";
    } catch {
      return "유효한 URL 형식이 아닙니다.";
    }
  }),
).annotations({
  description: "원격 저장소 URL",
  examples: ["https://github.com/user/repo.git"],
});
