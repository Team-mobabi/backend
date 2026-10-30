import { Either, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  BranchNameSchema,
  RemoteNameSchema,
  RemoteUrlSchema,
  RevisionSchema,
} from "./ref";

const accepts = (schema: Schema.Schema<string>, value: string) =>
  Either.isRight(Schema.decodeUnknownEither(schema)(value));

describe("BranchNameSchema", () => {
  it.each(["main", "feature/login", "fix-123", "release/v1.2", "한글-브랜치"])(
    "'%s' 허용",
    (name) => expect(accepts(BranchNameSchema, name)).toBe(true),
  );

  it.each([
    "--upload-pack=touch /tmp/pwn",
    "-D",
    "a..b",
    "has space",
    "a~1",
    "a^",
    "a:b",
    "feature/",
    "/feature",
    "x.lock",
    ".hidden",
    "a/.b",
    "@",
    "a@{1}",
    "",
  ])("'%s' 거부", (name) =>
    expect(accepts(BranchNameSchema, name)).toBe(false),
  );
});

describe("RevisionSchema", () => {
  it.each(["abc1234", "main", "HEAD~1", "HEAD^", "feature/x", "v1.0"])(
    "'%s' 허용",
    (rev) => expect(accepts(RevisionSchema, rev)).toBe(true),
  );

  it.each(["--output=/tmp/x", "-p", "a..b", "a b", "$(id)", "a;b"])(
    "'%s' 거부",
    (rev) => expect(accepts(RevisionSchema, rev)).toBe(false),
  );
});

describe("RemoteNameSchema / RemoteUrlSchema", () => {
  it("리모트 이름은 옵션처럼 보이면 안 된다", () => {
    expect(accepts(RemoteNameSchema, "origin")).toBe(true);
    expect(accepts(RemoteNameSchema, "--upload-pack=x")).toBe(false);
  });

  it("http(s) URL만 허용한다", () => {
    expect(accepts(RemoteUrlSchema, "https://github.com/a/b.git")).toBe(true);
    expect(accepts(RemoteUrlSchema, "file:///data/remote/x.git")).toBe(false);
    expect(accepts(RemoteUrlSchema, "ext::sh -c id")).toBe(false);
    expect(accepts(RemoteUrlSchema, "/data/remote/x.git")).toBe(false);
  });
});
