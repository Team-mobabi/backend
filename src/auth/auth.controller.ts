import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AuthService } from "@src/auth/auth.service";
import { SignUpDto } from "@src/auth/dto/sign-up.dto";
import { SignInDto } from "@src/auth/dto/sign-in.dto";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: "회원가입" })
  @ApiResponse({ status: 201, description: "회원가입 성공" })
  @ApiResponse({ status: 409, description: "이미 존재하는 이메일" })
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
