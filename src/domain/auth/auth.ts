import { Schema } from "effect";
import { EmailSchema, PasswordSchema } from "@src/domain/user/user";

export const SignUpBodySchema = Schema.Struct({
  email: EmailSchema,
  password: PasswordSchema,
});
export type SignUpBody = Schema.Schema.Type<typeof SignUpBodySchema>;

export const SignInBodySchema = Schema.Struct({
  email: EmailSchema,
  password: Schema.NonEmptyString,
});
export type SignInBody = Schema.Schema.Type<typeof SignInBodySchema>;

export const RefreshBodySchema = Schema.Struct({
  refreshToken: Schema.NonEmptyString,
});

export const TokenPairSchema = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
});
export type TokenPair = Schema.Schema.Type<typeof TokenPairSchema>;

export const AccessTokenSchema = Schema.Struct({ accessToken: Schema.String });
export type AccessToken = Schema.Schema.Type<typeof AccessTokenSchema>;

/**
 * refresh 토큰을 access 토큰으로 쓰지 못하도록 type을 구분한다.
 * type이 없는 토큰은 이 필드 도입 전에 발급된 access 토큰이다.
 */
export const TokenPayloadSchema = Schema.Struct({
  sub: Schema.String,
  email: Schema.String,
  type: Schema.optional(Schema.Literal("access", "refresh")),
});
export type TokenPayload = Schema.Schema.Type<typeof TokenPayloadSchema>;
