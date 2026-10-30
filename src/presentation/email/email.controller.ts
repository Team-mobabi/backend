import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Effect } from "effect";
import { EmailVerificationService } from "@src/application/email/email-verification.service";
import {
  SendVerificationBodySchema,
  VerifyCodeBodySchema,
  VerifyCodeResultSchema,
} from "@src/domain/email/email";
import { MessageSchema } from "@src/domain/user/user";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";

@ApiTags("Email")
@Controller("email")
export class EmailController extends BaseController {
  protected readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailVerification: EmailVerificationService) {
    super();
  }

  @ApiOperation({
    summary: "이메일 인증 코드 발송",
    description: "입력한 이메일로 6자리 인증 코드를 발송합니다.",
  })
  @ApiBody({ schema: apiSchema(SendVerificationBodySchema) })
  @ApiResponse({
    status: 200,
    description: "인증 코드가 성공적으로 발송되었습니다.",
    schema: apiSchema(MessageSchema),
  })
  @ApiResponse({ status: 400, description: "이메일 발송 실패" })
  @Post("send-verification")
  @HttpCode(HttpStatus.OK)
  sendVerificationEmail(@Body() body: unknown) {
    const { email } = this.decode(SendVerificationBodySchema, body);
    return this.runEffect(
      this.emailVerification
        .send(email)
        .pipe(Effect.as({ message: "인증 코드가 발송되었습니다." })),
    );
  }

  @ApiOperation({
    summary: "인증 코드 검증",
    description: "이메일로 받은 인증 코드를 검증합니다.",
  })
  @ApiBody({ schema: apiSchema(VerifyCodeBodySchema) })
  @ApiResponse({
    status: 200,
    description: "인증 코드가 올바릅니다.",
    schema: apiSchema(VerifyCodeResultSchema),
  })
  @ApiResponse({
    status: 400,
    description: "유효하지 않거나 만료된 인증 코드",
  })
  @Post("verify-code")
  @HttpCode(HttpStatus.OK)
  verifyCode(@Body() body: unknown) {
    const data = this.decode(VerifyCodeBodySchema, body);
    return this.runEffect(
      this.emailVerification.verify(data).pipe(
        Effect.as({
          verified: true as const,
          message: "이메일 인증이 완료되었습니다.",
        }),
      ),
    );
  }
}
