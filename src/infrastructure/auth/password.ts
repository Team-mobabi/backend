import * as bcrypt from "bcrypt";
import { Effect } from "effect";

// bcrypt 실패는 복구 불가능한 결함(defect)으로 취급한다
export const hashPassword = (password: string): Effect.Effect<string> =>
  Effect.promise(() =>
    bcrypt.genSalt().then((salt) => bcrypt.hash(password, salt)),
  );

export const verifyPassword = (
  password: string,
  hash: string,
): Effect.Effect<boolean> =>
  Effect.promise(() => bcrypt.compare(password, hash));
