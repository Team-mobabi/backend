import Anthropic from "@anthropic-ai/sdk";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Effect } from "effect";
import {
  type AiError,
  AiResponseError,
  AiUnavailableError,
} from "@src/common/error";

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;

export type Effort = "low" | "medium" | "high";

export interface CompletionRequest {
  readonly prompt: string;
  readonly effort: Effort;
}

@Injectable()
export class ClaudeClient {
  private readonly logger = new Logger(ClaudeClient.name);
  private readonly client: Anthropic | undefined;
  private readonly model: string;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>("CLAUDE_API_KEY");
    this.model = configService.get<string>("CLAUDE_MODEL") ?? DEFAULT_MODEL;
    if (!apiKey) {
      this.logger.warn(
        "CLAUDE_API_KEY is not configured. AI features will not be available.",
      );
      return;
    }
    this.client = new Anthropic({
      apiKey,
      // 큰 파일의 충돌 해결은 오래 걸릴 수 있다
      timeout: 180_000,
      maxRetries: 2,
    });
  }

  /** 단일 사용자 메시지를 보내고 텍스트 응답을 돌려준다 */
  complete(request: CompletionRequest): Effect.Effect<string, AiError> {
    const client = this.client;
    if (!client) {
      return Effect.fail(
        new AiUnavailableError({
          message:
            "AI 기능을 사용할 수 없습니다. CLAUDE_API_KEY가 설정되지 않았습니다.",
        }),
      );
    }

    return Effect.tryPromise({
      try: (signal) =>
        client.beta.messages.create(
          {
            model: this.model,
            max_tokens: MAX_TOKENS,
            output_config: { effort: request.effort },
            // 안전 분류기가 거절하면 서버가 다른 모델로 이어서 처리한다
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            messages: [{ role: "user", content: request.prompt }],
          },
          { signal },
        ),
      catch: (error) =>
        new AiResponseError({
          message: "AI 응답을 받지 못했습니다",
          originalError: error,
        }),
    }).pipe(
      Effect.flatMap((message) => {
        if (message.stop_reason === "refusal") {
          return Effect.fail(
            new AiResponseError({
              message: "AI가 요청을 처리하지 않았습니다",
              originalError: message.stop_details,
            }),
          );
        }
        if (message.stop_reason === "max_tokens") {
          this.logger.warn("AI 응답이 max_tokens로 인해 잘렸습니다");
        }
        // thinking 블록이 앞에 올 수 있어 text 블록만 모은다
        const text = message.content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("");
        return Effect.succeed(text);
      }),
    );
  }
}
