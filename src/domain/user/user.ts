import { Schema } from "effect";

export const EmailSchema = Schema.String.pipe(
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: () => "유효한 이메일 형식이 아닙니다.",
  }),
).annotations({ description: "이메일 주소", examples: ["user@example.com"] });

export const PasswordSchema = Schema.String.pipe(
  Schema.minLength(8, {
    message: () => "비밀번호는 최소 8자 이상이어야 합니다.",
  }),
).annotations({ description: "비밀번호 (최소 8자)" });

/** 외부에 노출되는 사용자 정보 — 비밀번호 해시/토큰은 구조적으로 포함되지 않는다 */
export const UserSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  createdAt: Schema.Date,
});
export type User = Schema.Schema.Type<typeof UserSchema>;

/** 인증 처리용 내부 모델. API 응답으로 내보내지 않는다 */
export const UserAccountSchema = Schema.Struct({
  ...UserSchema.fields,
  passwordHash: Schema.String,
});
export type UserAccount = Schema.Schema.Type<typeof UserAccountSchema>;

export const UserListSchema = Schema.Array(UserSchema);

export const MessageSchema = Schema.Struct({ message: Schema.String });
export type Message = Schema.Schema.Type<typeof MessageSchema>;

export const ChangePasswordBodySchema = Schema.Struct({
  currentPassword: Schema.String.annotations({ description: "현재 비밀번호" }),
  newPassword: PasswordSchema,
});
export type ChangePasswordBody = Schema.Schema.Type<
  typeof ChangePasswordBodySchema
>;

export const SearchUsersQuerySchema = Schema.Struct({
  q: Schema.String.pipe(
    Schema.minLength(1, { message: () => "검색어를 입력해주세요." }),
  ).annotations({ description: "검색 쿼리 (이메일 일부)" }),
});
