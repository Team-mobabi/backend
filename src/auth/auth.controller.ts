import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "@src/auth/auth.service";
import { SignUpDto } from "@src/auth/dto/sign-up.dto";
import { SignInDto } from "@src/auth/dto/sign-in.dto";
import { RefreshDto } from "@src/auth/dto/refresh.dto";
import { JwtAuthGuard } from "@src/auth/guards/jwt-auth.guard";
import { AuthUser } from "@src/repos/auth-user.decorator";
import { User } from "@src/users/entities/user.entity";

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

  @ApiOperation({
    summary: "로그인",
    description: "로그인 성공 시 accessToken(1시간)과 refreshToken(7일)을 반환합니다."
  })
  @ApiResponse({
    status: 200,
    description: "로그인 성공, accessToken과 refreshToken 반환",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
        refreshToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
      }
    }
  })
  @ApiResponse({ status: 401, description: "잘못된 인증 정보" })
  @HttpCode(HttpStatus.OK)
  @Post("/signin")
  signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto);
  }

  @ApiOperation({
    summary: "Access Token 갱신",
    description: "Refresh Token을 사용하여 새로운 Access Token을 발급받습니다."
  })
  @ApiResponse({
    status: 200,
    description: "새로운 Access Token 발급 성공",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
      }
    }
  })
  @ApiResponse({ status: 401, description: "유효하지 않은 Refresh Token" })
  @HttpCode(HttpStatus.OK)
  @Post("/refresh")
  refresh(@Body() refreshDto: RefreshDto) {
    return this.authService.refresh(refreshDto.refreshToken);
  }

  @ApiOperation({
    summary: "로그아웃",
    description: "로그아웃 시 서버에 저장된 Refresh Token을 무효화합니다."
  })
  @ApiResponse({
    status: 200,
    description: "로그아웃 성공",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", example: "로그아웃되었습니다." }
      }
    }
  })
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post("/logout")
  logout(@AuthUser() user: User) {
    return this.authService.logout(user.id);
  }
}
