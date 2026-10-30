import { Effect, Schema } from "effect";
import { DbQueryError, DbValidationError } from "@src/common/error";

export abstract class BaseRepository {
  /** TypeORM 호출 + Effect 에러 래핑 */
  protected query<T>(
    fn: () => Promise<T>,
    message: string,
  ): Effect.Effect<T, DbQueryError> {
    return Effect.tryPromise({
      try: fn,
      catch: (error) => new DbQueryError({ message, originalError: error }),
    });
  }

  /**
   * 엔티티 → 도메인 모델 변환. 스키마에 없는 필드(relation 등)는 제거되고
   * 엔티티 클래스가 repository 밖으로 새어나가지 않는다.
   */
  protected toModel<A, I>(
    schema: Schema.Schema<A, I>,
    entity: unknown,
  ): Effect.Effect<A, DbValidationError> {
    return Schema.validate(schema, { onExcessProperty: "ignore" })(entity).pipe(
      Effect.mapError(
        (issue) =>
          new DbValidationError({
            message: "DB 데이터가 도메인 모델과 일치하지 않습니다",
            details: issue.message,
          }),
      ),
    );
  }
}
