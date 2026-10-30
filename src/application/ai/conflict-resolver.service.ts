import { Injectable, Logger } from "@nestjs/common";
import { Duration, Effect, Either } from "effect";
import { type AiError, AiResponseError } from "@src/common/error";
import {
  type AiResolution,
  type ConflictContext,
  missingIdentifiers,
  parseResolution,
} from "@src/domain/ai/ai";
import { ClaudeClient } from "@src/infrastructure/ai/claude.client";
import { conflictResolutionPrompt, languageOf } from "./prompts";

const MAX_ATTEMPTS = 3;
const MIN_CONFIDENCE = 0.5;

@Injectable()
export class ConflictResolverService {
  private readonly logger = new Logger(ConflictResolverService.name);

  constructor(private readonly claude: ClaudeClient) {}

  /**
   * 충돌 해결안을 생성한다.
   * 응답 형식이 깨졌거나 신뢰도가 낮으면 최대 3번까지 다시 시도하고,
   * 마지막 시도의 저신뢰 결과는 그대로 돌려준다.
   */
  suggest(
    conflictContent: string,
    filePath: string,
    context?: ConflictContext,
  ): Effect.Effect<AiResolution, AiError> {
    const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
    const prompt = conflictResolutionPrompt(
      conflictContent,
      filePath,
      extension,
      languageOf(extension),
      context,
    );

    const attempt = (n: number): Effect.Effect<AiResolution, AiError> =>
      this.claude.complete({ prompt, effort: "high" }).pipe(
        Effect.flatMap((text) =>
          Either.match(parseResolution(text), {
            onLeft: (reason) =>
              Effect.fail(
                new AiResponseError({ message: reason, originalError: null }),
              ),
            onRight: Effect.succeed,
          }),
        ),
        Effect.tap((result) => this.warnMissing(result, conflictContent)),
        Effect.flatMap((result) => {
          if (result.confidence >= MIN_CONFIDENCE || n >= MAX_ATTEMPTS) {
            return Effect.succeed(result);
          }
          this.logger.warn(`낮은 신뢰도 (${result.confidence * 100}%), 재시도`);
          return attempt(n + 1);
        }),
        Effect.catchTag("AiResponseError", (error) => {
          if (n >= MAX_ATTEMPTS) return Effect.fail(error);
          this.logger.warn(`시도 ${n} 실패: ${error.message}`);
          return Effect.sleep(Duration.seconds(n)).pipe(
            Effect.zipRight(attempt(n + 1)),
          );
        }),
      );

    return attempt(1);
  }

  private warnMissing(result: AiResolution, original: string) {
    return Effect.sync(() => {
      const missing = missingIdentifiers(result.resolvedCode, original);
      if (missing.length > 0) {
        this.logger.warn(
          `일부 식별자가 해결된 코드에서 누락됨: ${missing.join(", ")}`,
        );
      }
    });
  }
}
