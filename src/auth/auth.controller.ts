import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AuthService } from "@src/auth/auth.service";
import { SignUpDto } from "@src/auth/dto/sign-up.dto";
import { SignInDto } from "@src/auth/dto/sign-in.dto";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: "회원가입",
    description: "이메일 인증을 완료한 후 회원가입을 진행합니다. 먼저 /email/send-verification으로 인증 코드를 받고, /email/verify-code로 인증을 완료한 후 이 API를 호출해야 합니다."
  })
  @ApiResponse({
    status: 201,
    description: "회원가입 성공",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", example: "회원가입이 완료되었습니다." }
      }
    }
  })
  @ApiResponse({ status: 400, description: "이메일 인증이 완료되지 않음" })
  @ApiResponse({ status: 409, description: "이미 사용 중인 이메일" })
  @Post("/signup")
  signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  @ApiOperation({ summary: "로그인" })
  @ApiResponse({ status: 200, description: "로그인 성공, JWT 토큰 반환" })
  @ApiResponse({ status: 401, description: "잘못된 인증 정보" })
  @HttpCode(HttpStatus.OK)
  @Post("/signin")
  signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto);
  }
}
