import {
  BadRequestException,
  HttpException,
  type Logger,
} from "@nestjs/common";
import { Effect, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import {
  type AppError,
  ApiError,
  FileSystemError,
  RepoNotFoundError,
} from "@src/common/error";
import { BaseController } from "./base.controller";

class TestController extends BaseController {
  readonly error = vi.fn();
  readonly warn = vi.fn();
  protected readonly logger = {
    error: this.error,
    warn: this.warn,
  } as unknown as Logger;

  run<A>(effect: Effect.Effect<A, AppError>): Promise<A> {
    return this.runEffect(effect);
  }

  parse<A, I>(schema: Schema.Schema<A, I>, data: unknown): A {
    return this.decode(schema, data);
  }
}

const captureHttpError = async (
  promise: Promise<unknown>,
): Promise<HttpException> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) return error;
    throw error;
  }
  throw new Error("expected HttpException");
};

describe("BaseController.runEffect", () => {
  it("성공 값은 그대로 반환한다", async () => {
    const controller = new TestController();
    await expect(controller.run(Effect.succeed("ok"))).resolves.toBe("ok");
  });

  it("도메인 에러를 태그별 상태 코드와 Nest 기본 응답 형태로 변환한다", async () => {
    const controller = new TestController();
    const error = await captureHttpError(
      controller.run(
        Effect.fail(new RepoNotFoundError({ message: "없음", repoId: "r1" })),
      ),
    );

    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual({
      statusCode: 404,
      message: "없음",
      error: "Not Found",
    });
    expect(controller.warn).toHaveBeenCalledOnce();
    expect(controller.error).not.toHaveBeenCalled();
  });

  it("ApiError는 지정한 상태 코드를 사용한다", async () => {
    const controller = new TestController();
    const error = await captureHttpError(
      controller.run(
        Effect.fail(new ApiError({ status: 418, message: "tea" })),
      ),
    );
    expect(error.getStatus()).toBe(418);
  });

  it("5xx 에러는 원인과 함께 error 레벨로 기록한다", async () => {
    const controller = new TestController();
    const cause = new Error("EACCES");
    const error = await captureHttpError(
      controller.run(
        Effect.fail(
          new FileSystemError({ message: "쓰기 실패", originalError: cause }),
        ),
      ),
    );

    expect(error.getStatus()).toBe(500);
    expect(controller.error).toHaveBeenCalledWith(
      "[FileSystemError] 쓰기 실패",
      cause,
    );
  });

  it("defect(예상치 못한 throw)는 HttpException으로 바꾸지 않고 그대로 던진다", async () => {
    const controller = new TestController();
    await expect(
      controller.run(Effect.die(new Error("boom"))),
    ).rejects.not.toBeInstanceOf(HttpException);
  });
});

describe("BaseController.decode", () => {
  const Body = Schema.Struct({
    name: Schema.NonEmptyString,
    age: Schema.Number,
  });

  it("유효한 입력을 디코딩한다", () => {
    const controller = new TestController();
    expect(controller.parse(Body, { name: "a", age: 1 })).toEqual({
      name: "a",
      age: 1,
    });
  });

  it("모든 필드 오류를 경로와 함께 400으로 반환한다", () => {
    const controller = new TestController();
    try {
      controller.parse(Body, { name: "", age: "x" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(response.message).toHaveLength(2);
      expect(response.message[0]).toMatch(/^name: /);
      expect(response.message[1]).toMatch(/^age: /);
    }
  });

  it("optional 필드는 스키마가 정의한 메시지만 남긴다", () => {
    const controller = new TestController();
    const Query = Schema.Struct({
      path: Schema.optional(
        Schema.String.pipe(
          Schema.filter((value) =>
            value.startsWith("..") ? "밖으로 나갈 수 없습니다" : undefined,
          ),
        ),
      ),
    });
    try {
      controller.parse(Query, { path: "../x" });
      expect.unreachable();
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(response.message).toEqual(["path: 밖으로 나갈 수 없습니다"]);
    }
  });

  it("리터럴 union 오류는 후보를 합쳐 한 줄로 보여준다", () => {
    const controller = new TestController();
    const Body = Schema.Struct({ role: Schema.Literal("read", "write") });
    try {
      controller.parse(Body, { role: "owner" });
      expect.unreachable();
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(response.message).toEqual([
        'role: Expected "read" | "write", actual "owner"',
      ]);
    }
  });
});
