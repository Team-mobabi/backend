import { STATUS_CODES } from "node:http";
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  type Logger,
} from "@nestjs/common";
import { Effect, Either, ParseResult, Schema } from "effect";
import type { AppError } from "@src/common/error";

// Record로 선언해 AppError에 새 태그가 추가되면 컴파일 에러로 매핑 누락을 잡는다
const STATUS_BY_TAG: Record<Exclude<AppError["_tag"], "ApiError">, number> = {
  RepoNotFoundError: HttpStatus.NOT_FOUND,
  RepoAccessDeniedError: HttpStatus.FORBIDDEN,
  FileNotFoundError: HttpStatus.NOT_FOUND,
  FileAlreadyExistsError: HttpStatus.CONFLICT,
  FileValidationError: HttpStatus.BAD_REQUEST,
  FileSystemError: HttpStatus.INTERNAL_SERVER_ERROR,
  GitOperationError: HttpStatus.INTERNAL_SERVER_ERROR,
  GitConflictError: HttpStatus.CONFLICT,
  GitRefNotFoundError: HttpStatus.NOT_FOUND,
  DbQueryError: HttpStatus.INTERNAL_SERVER_ERROR,
  DbValidationError: HttpStatus.INTERNAL_SERVER_ERROR,
  AiUnavailableError: HttpStatus.SERVICE_UNAVAILABLE,
  AiResponseError: HttpStatus.BAD_GATEWAY,
};

export const statusOf = (error: AppError): number =>
  error._tag === "ApiError" ? error.status : STATUS_BY_TAG[error._tag];

export abstract class BaseController {
  protected abstract readonly logger: Logger;

  protected runEffect<A>(effect: Effect.Effect<A, AppError>): Promise<A> {
    return Effect.runPromise(Effect.either(effect)).then((result) => {
      if (Either.isRight(result)) {
        return result.right;
      }
      throw this.toHttpException(result.left);
    });
  }

  /** Effect Schema 디코딩 — 실패 시 필드별 메시지를 담아 400 */
  protected decode<A, I>(schema: Schema.Schema<A, I>, data: unknown): A {
    const result = Schema.decodeUnknownEither(schema, { errors: "all" })(data);
    if (Either.isRight(result)) {
      return result.right;
    }
    const messages = ParseResult.ArrayFormatter.formatErrorSync(
      result.left,
    ).map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message,
    );
    throw new BadRequestException(messages);
  }

  private toHttpException(error: AppError): HttpException {
    const status = statusOf(error);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const cause = "originalError" in error ? error.originalError : undefined;
      this.logger.error(`[${error._tag}] ${error.message}`, cause);
    } else {
      this.logger.warn(`[${error._tag}] ${error.message}`);
    }

    // 기존 Nest 내장 예외와 동일한 응답 형태 유지 (프론트 호환)
    return new HttpException(
      {
        statusCode: status,
        message: error.message,
        error: STATUS_CODES[status] ?? "Error",
      },
      status,
    );
  }
}
