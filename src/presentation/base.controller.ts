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
  InvalidCredentialsError: HttpStatus.UNAUTHORIZED,
  InvalidRefreshTokenError: HttpStatus.UNAUTHORIZED,
  EmailAlreadyInUseError: HttpStatus.CONFLICT,
  EmailNotVerifiedError: HttpStatus.BAD_REQUEST,
  UserNotFoundError: HttpStatus.NOT_FOUND,
  VerificationCodeError: HttpStatus.BAD_REQUEST,
  // 기존 API와 동일하게 400 유지 (프론트 호환)
  EmailDeliveryError: HttpStatus.BAD_REQUEST,
};

export const statusOf = (error: AppError): number =>
  error._tag === "ApiError" ? error.status : STATUS_BY_TAG[error._tag];

/** Effect 실행 후 실패를 HttpException으로 변환. BaseController로 옮기기 전의 컨트롤러에서도 사용 */
export const runAppEffect = <A>(
  effect: Effect.Effect<A, AppError>,
  logger: Logger,
): Promise<A> =>
  Effect.runPromise(Effect.either(effect)).then((result) => {
    if (Either.isRight(result)) {
      return result.right;
    }
    throw toHttpException(result.left, logger);
  });

const toHttpException = (error: AppError, logger: Logger): HttpException => {
  const status = statusOf(error);

  const cause = "originalError" in error ? error.originalError : undefined;
  // 4xx라도 하위 원인(SMTP 실패 등)이 있으면 추적할 수 있도록 error로 남긴다
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR || cause !== undefined) {
    logger.error(`[${error._tag}] ${error.message}`, cause);
  } else {
    logger.warn(`[${error._tag}] ${error.message}`);
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
};

type Issue = ParseResult.ArrayFormatterIssue;

/**
 * optional/union은 분기마다 "Expected ..." 이슈를 만들어 메시지가 장황해진다.
 * 같은 필드에 스키마가 정의한 메시지(filter 등)가 있으면 그것만 남긴다.
 */
const readableIssues = (issues: readonly Issue[]): string[] => {
  const keyOf = (issue: Issue) => issue.path.join(".");
  const isGeneric = (issue: Issue) => issue.message.startsWith("Expected ");
  const customKeys = new Set(
    issues.filter((issue) => !isGeneric(issue)).map(keyOf),
  );
  const messages = issues
    .filter((issue) => !(isGeneric(issue) && customKeys.has(keyOf(issue))))
    .map((issue) =>
      issue.path.length > 0
        ? `${keyOf(issue)}: ${issue.message}`
        : issue.message,
    );
  return [...new Set(messages)];
};

export abstract class BaseController {
  protected abstract readonly logger: Logger;

  protected runEffect<A>(effect: Effect.Effect<A, AppError>): Promise<A> {
    return runAppEffect(effect, this.logger);
  }

  /** Effect Schema 디코딩 — 실패 시 필드별 메시지를 담아 400 */
  protected decode<A, I>(schema: Schema.Schema<A, I>, data: unknown): A {
    const result = Schema.decodeUnknownEither(schema, { errors: "all" })(data);
    if (Either.isRight(result)) {
      return result.right;
    }
    const messages = readableIssues(
      ParseResult.ArrayFormatter.formatErrorSync(result.left),
    );
    throw new BadRequestException(messages);
  }
}
