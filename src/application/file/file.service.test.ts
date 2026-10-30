import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Effect, Exit, Schema } from "effect";
import type { SimpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateFileBodySchema,
  UpdateFileBodySchema,
  UploadFilesBodySchema,
} from "@src/domain/file/file";
import { RepoPathSchema } from "@src/domain/file/repo-path";
import type { RepoWorkspaceService } from "@src/application/repo/repo-workspace.service";
import { FileService, type UploadedFile } from "./file.service";

const p = Schema.decodeSync(RepoPathSchema);
const tagOf = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit) && exit.cause._tag === "Fail"
    ? exit.cause.error._tag
    : undefined;

const upload = (name: string, content = name): UploadedFile => ({
  originalname: name,
  mimetype: "text/plain",
  buffer: Buffer.from(content),
});

describe("FileService", () => {
  let root: string;
  let gitAdd: ReturnType<typeof vi.fn>;
  let service: FileService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "file-svc-"));
    await fs.mkdir(path.join(root, "src"));
    await fs.mkdir(path.join(root, ".git"));
    await fs.writeFile(path.join(root, "README.md"), "# hello");
    await fs.writeFile(path.join(root, "src", "bin.dat"), Buffer.from([1, 0]));
    gitAdd = vi.fn(async () => undefined);
    const workspaces = {
      open: () =>
        Effect.succeed({
          repo: { name: "demo" },
          root,
          git: { add: gitAdd } as unknown as SimpleGit,
        }),
    } as unknown as RepoWorkspaceService;
    service = new FileService(workspaces);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromiseExit(effect);

  describe("browse", () => {
    it("폴더를 목록으로 반환하고 .git은 숨긴다", async () => {
      const result = await Effect.runPromise(service.browse("r", "u", p("")));
      expect(result.type).toBe("directory");
      if (result.type !== "directory") return;
      expect(result.folders.map((f) => f.name)).toEqual(["src"]);
      expect(result.files.map((f) => f.path)).toEqual(["README.md"]);
    });

    it("텍스트와 바이너리를 구분한다", async () => {
      const text = await Effect.runPromise(
        service.browse("r", "u", p("README.md")),
      );
      expect(text).toMatchObject({ type: "file", content: "# hello" });
      const binary = await Effect.runPromise(
        service.browse("r", "u", p("src/bin.dat")),
      );
      expect(binary.type).toBe("binary");
    });

    it("없는 경로는 FileNotFoundError", async () => {
      const exit = await run(service.browse("r", "u", p("nope")));
      expect(tagOf(exit)).toBe("FileNotFoundError");
    });
  });

  describe("create", () => {
    const body = (input: object) =>
      Schema.decodeUnknownSync(CreateFileBodySchema)(input);

    it("하위 폴더를 만들며 파일을 생성한다", async () => {
      const result = await Effect.runPromise(
        service.create(
          "r",
          "u",
          body({ filename: "a/b.txt", content: "x", path: "docs" }),
        ),
      );
      expect(result.path).toBe("docs/a/b.txt");
      expect(await fs.readFile(path.join(root, "docs/a/b.txt"), "utf8")).toBe(
        "x",
      );
    });

    it("overwrite가 아니면 기존 파일을 덮어쓰지 않는다", async () => {
      const exit = await run(
        service.create("r", "u", body({ filename: "README.md", content: "x" })),
      );
      expect(tagOf(exit)).toBe("FileAlreadyExistsError");
      expect(await fs.readFile(path.join(root, "README.md"), "utf8")).toBe(
        "# hello",
      );
    });

    it("overwrite면 덮어쓴다", async () => {
      await Effect.runPromise(
        service.create(
          "r",
          "u",
          body({ filename: "README.md", content: "new", overwrite: true }),
        ),
      );
      expect(await fs.readFile(path.join(root, "README.md"), "utf8")).toBe(
        "new",
      );
    });
  });

  it("update는 폴더를 거부한다", async () => {
    const data = Schema.decodeUnknownSync(UpdateFileBodySchema)({
      path: "src",
      content: "x",
    });
    const exit = await run(service.update("r", "u", data));
    expect(tagOf(exit)).toBe("FileValidationError");
  });

  it("remove는 삭제 후 git add로 스테이징한다", async () => {
    const result = await Effect.runPromise(service.remove("r", "u", p("src")));
    expect(result).toEqual({
      success: true,
      deletedPath: "src",
      type: "folder",
    });
    await expect(fs.stat(path.join(root, "src"))).rejects.toThrow();
    expect(gitAdd).toHaveBeenCalledWith("src");
  });

  it("remove는 git add 실패를 무시한다", async () => {
    gitAdd.mockRejectedValueOnce(new Error("pathspec did not match"));
    const exit = await run(service.remove("r", "u", p("README.md")));
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  describe("upload", () => {
    const options = (input: object) =>
      Schema.decodeUnknownSync(UploadFilesBodySchema)(input);

    it(".gitignore에 걸린 파일은 제외한다", async () => {
      await fs.writeFile(path.join(root, ".gitignore"), "*.log\n");
      const result = await Effect.runPromise(
        service.upload(
          "r",
          "u",
          [upload("app.ts"), upload("debug.log")],
          options({ path: "up" }),
        ),
      );
      expect(result.uploadedFiles.map((f) => f.path)).toEqual(["up/app.ts"]);
      expect(result.ignoredFiles).toEqual(["debug.log"]);
    });

    it("paths가 있으면 폴더 구조를 유지하고, 빈 항목은 파일명을 쓴다", async () => {
      const result = await Effect.runPromise(
        service.upload(
          "r",
          "u",
          [upload("a.ts"), upload("b.ts")],
          options({ paths: ["dir/x/a.ts", ""] }),
        ),
      );
      expect(result.uploadedFiles.map((f) => f.path)).toEqual([
        "dir/x/a.ts",
        "b.ts",
      ]);
    });

    it("overwrite=false에서 충돌이 하나라도 있으면 아무것도 쓰지 않는다", async () => {
      const exit = await run(
        service.upload(
          "r",
          "u",
          [upload("fresh.txt"), upload("README.md")],
          options({ overwrite: "false" }),
        ),
      );
      expect(tagOf(exit)).toBe("FileAlreadyExistsError");
      await expect(fs.stat(path.join(root, "fresh.txt"))).rejects.toThrow();
    });

    it("상위 경로로 빠져나가는 파일명을 거부한다", async () => {
      const exit = await run(
        service.upload("r", "u", [upload("../escape.txt")], options({})),
      );
      expect(tagOf(exit)).toBe("FileValidationError");
    });
  });

  it("download는 폴더를 거부하고 파일은 내용을 반환한다", async () => {
    expect(tagOf(await run(service.download("r", "u", p("src"))))).toBe(
      "FileValidationError",
    );
    const file = await Effect.runPromise(
      service.download("r", "u", p("README.md")),
    );
    expect(file.filename).toBe("README.md");
    expect(file.content.toString()).toBe("# hello");
  });
});
