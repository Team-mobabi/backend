import { Schema } from "effect";
import { EmailSchema } from "@src/domain/user/user";

export const VERIFICATION_CODE_TTL_MINUTES = 5;

export const SendVerificationBodySchema = Schema.Struct({
  email: EmailSchema,
});

export const VerifyCodeBodySchema = Schema.Struct({
  email: EmailSchema,
  code: Schema.String.pipe(
    Schema.pattern(/^\d{6}$/, {
      message: () => "인증 번호는 6자리 숫자입니다.",
    }),
  ).annotations({ description: "인증 번호 (6자리)", examples: ["123456"] }),
});
export type VerifyCodeBody = Schema.Schema.Type<typeof VerifyCodeBodySchema>;

export const VerifyCodeResultSchema = Schema.Struct({
  verified: Schema.Literal(true),
  message: Schema.String,
});
