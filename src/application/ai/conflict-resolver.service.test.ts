import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { type AiResponseError, AiUnavailableError } from "@src/common/error";
import type { ClaudeClient } from "@src/infrastructure/ai/claude.client";
import { ConflictResolverService } from "./conflict-resolver.service";

const reply = (confidence: number) =>
  `MERGED_CODE:\n\`\`\`ts\nconst a = 1;\n\`\`\`\nEXPLANATION: ok\nCONFIDENCE: ${confidence}`;

const setup = (
  responses: Array<Effect.Effect<string, AiResponseError | AiUnavailableError>>,
) => {
  const complete = vi.fn(() => responses.shift() ?? Effect.succeed(reply(90)));
  const service = new ConflictResolverService({
    complete,
  } as unknown as ClaudeClient);
  return { service, complete };
};

describe("ConflictResolverService.suggest", () => {
  it("신뢰도가 낮으면 다시 시도한다", async () => {
    const { service, complete } = setup([
      Effect.succeed(reply(30)),
      Effect.succeed(reply(80)),
    ]);
    const result = await Effect.runPromise(
      service.suggest(
        "<<<<<<< HEAD\nconst a = 0;\n=======\nconst a = 1;\n>>>>>>> x",
        "a.ts",
      ),
    );
    expect(result.confidence).toBe(0.8);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("마지막 시도의 저신뢰 결과는 그대로 돌려준다", async () => {
    const { service, complete } = setup([
      Effect.succeed(reply(10)),
      Effect.succeed(reply(20)),
      Effect.succeed(reply(30)),
    ]);
    const result = await Effect.runPromise(service.suggest("c", "a.ts"));
    expect(result.confidence).toBe(0.3);
    expect(complete).toHaveBeenCalledTimes(3);
  });

  it("API 키가 없으면 재시도 없이 바로 실패한다", async () => {
    const { service, complete } = setup([
      Effect.fail(new AiUnavailableError({ message: "no key" })),
    ]);
    const exit = await Effect.runPromiseExit(service.suggest("c", "a.ts"));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("응답 형식이 계속 깨지면 3번 시도 후 실패한다", async () => {
    vi.useFakeTimers();
    const { service, complete } = setup([
      Effect.succeed("garbage"),
      Effect.succeed("garbage"),
      Effect.succeed("garbage"),
    ]);
    const pending = Effect.runPromiseExit(service.suggest("c", "a.ts"));
    await vi.runAllTimersAsync();
    const exit = await pending;
    vi.useRealTimers();
    expect(Exit.isFailure(exit)).toBe(true);
    expect(complete).toHaveBeenCalledTimes(3);
  });
});
