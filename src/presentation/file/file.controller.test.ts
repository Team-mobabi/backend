import { BadRequestException, HttpException } from "@nestjs/common";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { FileService } from "@src/application/file/file.service";
import { FileNotFoundError } from "@src/common/error";
import type { User } from "@src/infrastructure/database/entities/user.entity";
import { FileController } from "./file.controller";

const REPO_ID = "11111111-1111-4111-8111-111111111111";
const user = { id: "u1" } as User;

const setup = () => {
  const fileService = {
    browse: vi.fn(() => Effect.succeed({ type: "directory" })),
    remove: vi.fn(() => Effect.succeed({ success: true })),
  };
  const controller = new FileController(fileService as unknown as FileService);
  return { controller, fileService };
};

describe("FileController", () => {
  it("경로 탈출 시도는 서비스 호출 전에 400으로 막는다", () => {
    const { controller, fileService } = setup();
    expect(() =>
      controller.browseFiles(REPO_ID, user, { path: "../../etc/passwd" }),
    ).toThrow(BadRequestException);
    expect(fileService.browse).not.toHaveBeenCalled();
  });

  it("UUID가 아닌 repoId는 400", () => {
    const { controller } = setup();
    expect(() => controller.browseFiles("not-a-uuid", user, {})).toThrow(
      BadRequestException,
    );
  });

  it("루트 삭제 요청(path=.)을 거부한다", () => {
    const { controller, fileService } = setup();
    expect(() => controller.deleteFile(REPO_ID, user, { path: "." })).toThrow(
      BadRequestException,
    );
    expect(fileService.remove).not.toHaveBeenCalled();
  });

  it("path 생략 시 루트를 조회한다", async () => {
    const { controller, fileService } = setup();
    await controller.browseFiles(REPO_ID, user, {});
    expect(fileService.browse).toHaveBeenCalledWith(REPO_ID, "u1", "");
  });

  it("도메인 에러를 HTTP 상태로 변환한다", async () => {
    const { controller, fileService } = setup();
    fileService.browse.mockReturnValueOnce(
      Effect.fail(
        new FileNotFoundError({ message: "없음", path: "x" }),
      ) as never,
    );
    const error = await controller
      .browseFiles(REPO_ID, user, { path: "x" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(404);
  });
});
