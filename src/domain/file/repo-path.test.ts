import { Either, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  joinRepoPath,
  MAX_SEGMENT_BYTES,
  NonRootRepoPathSchema,
  RepoPathSchema,
} from "./repo-path";

const decode = Schema.decodeUnknownEither(RepoPathSchema);
const ok = (input: string) => {
  const result = decode(input);
  if (Either.isLeft(result)) throw new Error(`rejected: ${input}`);
  return result.right as string;
};

describe("RepoPathSchema", () => {
  it.each([
    ["src/main.ts", "src/main.ts"],
    ["./src//main.ts", "src/main.ts"],
    ["src/../README.md", "README.md"],
    ["src\\win\\path.ts", "src/win/path.ts"],
    ["docs/", "docs"],
    ["", ""],
    [".", ""],
    ["./", ""],
    [".gitignore", ".gitignore"],
    [".github/workflows/ci.yml", ".github/workflows/ci.yml"],
  ])("'%s' → '%s'로 정규화한다", (input, expected) => {
    expect(ok(input)).toBe(expected);
  });

  it.each([
    ["../etc/passwd"],
    ["src/../../etc/passwd"],
    [".."],
    ["/etc/passwd"],
    ["\\etc\\passwd"],
    ["a\0b"],
    [".git/hooks/post-commit"],
    ["sub/.git/config"],
    [".git"],
  ])("'%s'를 거부한다", (input) => {
    expect(Either.isLeft(decode(input))).toBe(true);
  });

  it("세그먼트 바이트 길이를 제한한다 (한글은 3바이트)", () => {
    const limit = "가".repeat(Math.floor(MAX_SEGMENT_BYTES / 3));
    expect(ok(`dir/${limit}`)).toBe(`dir/${limit}`);
    expect(Either.isLeft(decode(`dir/${limit}가`))).toBe(true);
  });
});

describe("NonRootRepoPathSchema", () => {
  it.each([[""], ["."], ["./"], ["src/.."]])(
    "루트를 가리키는 '%s'를 거부한다",
    (input) => {
      const result = Schema.decodeUnknownEither(NonRootRepoPathSchema)(input);
      expect(Either.isLeft(result)).toBe(true);
    },
  );
});

describe("joinRepoPath", () => {
  it("검증된 경로를 합친다", () => {
    const base = Schema.decodeSync(RepoPathSchema)("src");
    const child = Schema.decodeSync(RepoPathSchema)("a/b.ts");
    expect(joinRepoPath(base, child)).toBe("src/a/b.ts");
  });
});
