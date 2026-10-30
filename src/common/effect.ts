import { Effect, Option } from "effect";

/** Option.none이면 지정한 에러로 실패시킨다 (조회 결과 → 404 등) */
export const getOrFail =
  <E>(onNone: () => E) =>
  <A, E2, R>(
    self: Effect.Effect<Option.Option<A>, E2, R>,
  ): Effect.Effect<A, E | E2, R> =>
    Effect.flatMap(
      self,
      Option.match({
        onNone: () => Effect.fail(onNone()),
        onSome: Effect.succeed,
      }),
    );
