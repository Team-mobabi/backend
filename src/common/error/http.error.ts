import { Data } from "effect";

/** 도메인 에러로 표현하기 애매한 경우 상태 코드를 직접 지정 */
export class ApiError extends Data.TaggedError("ApiError")<{
  status: number;
  message: string;
}> {}
