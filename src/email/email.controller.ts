import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { EmailService } from "@src/email/email.service";
import { SendVerificationDto } from "@src/email/dto/send-verification.dto";
import { VerifyCodeDto } from "@src/email/dto/verify-code.dto";

@ApiTags("Email")
@Controller("email")
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post("send-verification")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "이메일 인증 코드 발송",
    description: "입력한 이메일로 6자리 인증 코드를 발송합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "인증 코드가 성공적으로 발송되었습니다.",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", example: "인증 코드가 발송되었습니다." },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "이메일 발송 실패",
  })
  async sendVerificationEmail(
    @Body() sendVerificationDto: SendVerificationDto,
  ) {
    await this.emailService.sendVerificationEmail(sendVerificationDto.email);
    return {
      message: "인증 코드가 발송되었습니다.",
    };
  }

  @Post("test")
  @HttpCode(HttpStatus.OK)
  test() {
    console.log('[EmailController.test] TEST ENDPOINT HIT!');
    return { success: true, message: "TEST ENDPOINT WORKS!" };
  }

  @Post("verify-code")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "인증 코드 검증",
    description: "이메일로 받은 인증 코드를 검증합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "인증 코드가 올바릅니다.",
    schema: {
      type: "object",
      properties: {
        verified: { type: "boolean", example: true },
        message: { type: "string", example: "이메일 인증이 완료되었습니다." },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "유효하지 않거나 만료된 인증 코드",
  })
  async verifyCode(@Body() verifyCodeDto: VerifyCodeDto) {
    console.log('[EmailController.verifyCode] 요청 받음:', {
      body: verifyCodeDto,
      timestamp: new Date().toISOString(),
    });

    const verified = await this.emailService.verifyCode(
      verifyCodeDto.email,
      verifyCodeDto.code,
    );

    console.log('[EmailController.verifyCode] 응답:', { verified });

    return {
      verified,
      message: "이메일 인증이 완료되었습니다.",
    };
  }
}