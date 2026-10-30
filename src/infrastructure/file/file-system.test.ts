import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Effect, Exit, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepoPathSchema } from "@src/domain/file/repo-path";
import { resolveInside } from "./file-system";

const repoPath = Schema.decodeSync(RepoPathSchema);

describe("resolveInside", () => {
  let sandbox: string;
  let root: string;
  let outside: string;

  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "fs-test-"));
    root = path.join(sandbox, "repo");
    outside = path.join(sandbox, "outside");
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "secret.txt"), "secret");
  });

  afterEach(async () => {
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  const run = (relative: string) =>
    Effect.runPromiseExit(resolveInside(root, repoPath(relative)));

  it("루트 안의 경로를 절대 경로로 변환한다", async () => {
    const exit = await run("src/new-file.ts");
    expect(exit).toEqual(Exit.succeed(path.join(root, "src/new-file.ts")));
  });

  it("아직 없는 깊은 경로도 허용한다", async () => {
    const exit = await run("a/b/c/d.ts");
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("루트 자체를 허용한다", async () => {
    expect(await run("")).toEqual(Exit.succeed(path.resolve(root)));
  });

  it("레포 밖을 가리키는 폴더 심볼릭 링크를 거부한다", async () => {
    await fs.symlink(outside, path.join(root, "link"));
    const exit = await run("link/secret.txt");
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("FileValidationError");
  });

  it("레포 밖 파일을 가리키는 파일 심볼릭 링크를 거부한다", async () => {
    await fs.symlink(
      path.join(outside, "secret.txt"),
      path.join(root, "evil.txt"),
    );
    expect(Exit.isFailure(await run("evil.txt"))).toBe(true);
  });

  it("레포 안을 가리키는 심볼릭 링크는 허용한다", async () => {
    await fs.symlink(path.join(root, "src"), path.join(root, "alias"));
    expect(Exit.isSuccess(await run("alias/file.ts"))).toBe(true);
  });
});
