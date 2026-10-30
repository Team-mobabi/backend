import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ConfigService } from "@nestjs/config";
import { Effect } from "effect";
import simpleGit from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepoStorageService } from "./repo-storage.service";

const exists = (p: string) =>
  fs.stat(p).then(
    () => true,
    () => false,
  );

describe("RepoStorageService (실제 git)", () => {
  let base: string;
  let storage: RepoStorageService;

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "storage-"));
    storage = new RepoStorageService({
      get: (key: string, fallback?: string) =>
        ({
          ENV: "dev",
          REPO_LOCAL_BASE_PATH: path.join(base, "repos"),
          REMOTE_LOCAL_BASE_PATH: path.join(base, "remote"),
        })[key] ?? fallback,
    } as unknown as ConfigService);
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it("initialize는 bare 원격과 초기 커밋이 있는 main 작업 사본을 만든다", async () => {
    await Effect.runPromise(storage.initialize("r1", "owner"));
    const git = simpleGit(storage.workingCopyPath("owner", "r1"));
    expect((await git.revparse(["--abbrev-ref", "HEAD"])).trim()).toBe("main");
    expect((await git.log()).latest?.message).toBe("Initial commit");
    expect(await exists(path.join(storage.remotePath("r1"), "HEAD"))).toBe(
      true,
    );
  });

  it("fork는 원본의 모든 브랜치를 로컬 브랜치로 가져온다", async () => {
    await Effect.runPromise(storage.initialize("src", "owner"));
    const git = simpleGit(storage.workingCopyPath("owner", "src"));
    await git.checkoutLocalBranch("feature");
    await git.commit("feat", undefined, { "--allow-empty": null });
    await git.push("origin", "main");
    await git.push("origin", "feature");

    await Effect.runPromise(storage.fork("src", "fork", "other"));

    const forked = simpleGit(storage.workingCopyPath("other", "fork"));
    const branches = await forked.branchLocal();
    expect(branches.all.sort()).toEqual(["feature", "main"]);
    expect(branches.current).toBe("main");
  });

  it("removeAll은 원격과 모든 사용자의 작업 사본을 지운다", async () => {
    await Effect.runPromise(storage.initialize("r1", "owner"));
    await Effect.runPromise(storage.cloneWorkingCopy("r1", "viewer"));
    await fs.mkdir(storage.workingCopyPath("viewer", "r2"), {
      recursive: true,
    });

    await Effect.runPromise(storage.removeAll("r1"));

    expect(await exists(storage.remotePath("r1"))).toBe(false);
    expect(await exists(storage.workingCopyPath("owner", "r1"))).toBe(false);
    expect(await exists(storage.workingCopyPath("viewer", "r1"))).toBe(false);
    expect(await exists(storage.workingCopyPath("viewer", "r2"))).toBe(true);
  });
});
