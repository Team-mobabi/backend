import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthService } from "@src/application/auth/auth.service";
import {
  AccessTokenSchema,
  RefreshBodySchema,
  SignInBodySchema,
  SignUpBodySchema,
  TokenPairSchema,
} from "@src/domain/auth/auth";
import { MessageSchema, type User } from "@src/domain/user/user";
import { JwtAuthGuard } from "@src/infrastructure/auth/jwt-auth.guard";
import { AuthUser } from "@src/presentation/auth/auth-user.decorator";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController extends BaseController {
  protected readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {
    super();
  }

  @ApiOperation({
    summary: "회원가입",
    description:
      "이메일 인증을 완료한 후 회원가입을 진행합니다. 먼저 /email/send-verification으로 인증 코드를 받고, /email/verify-code로 인증을 완료한 후 이 API를 호출해야 합니다.",
  })
  @ApiBody({ schema: apiSchema(SignUpBodySchema) })
  @ApiResponse({
    status: 201,
    description: "회원가입 성공",
    schema: apiSchema(MessageSchema),
  })
  @ApiResponse({ status: 400, description: "이메일 인증이 완료되지 않음" })
  @ApiResponse({ status: 409, description: "이미 사용 중인 이메일" })
  @Post("/signup")
  signUp(@Body() body: unknown) {
    const data = this.decode(SignUpBodySchema, body);
    return this.runEffect(this.authService.signUp(data));
  }

  @ApiOperation({
    summary: "로그인",
    description:
      "로그인 성공 시 accessToken(1시간)과 refreshToken(4시간)을 반환합니다.",
  })
  @ApiBody({ schema: apiSchema(SignInBodySchema) })
  @ApiResponse({
    status: 200,
    description: "로그인 성공",
    schema: apiSchema(TokenPairSchema),
  })
  @ApiResponse({ status: 401, description: "잘못된 인증 정보" })
  @HttpCode(HttpStatus.OK)
  @Post("/signin")
  signIn(@Body() body: unknown) {
    const data = this.decode(SignInBodySchema, body);
    return this.runEffect(this.authService.signIn(data));
  }

  @ApiOperation({
    summary: "Access Token 갱신",
    description: "Refresh Token을 사용하여 새로운 Access Token을 발급받습니다.",
  })
  @ApiBody({ schema: apiSchema(RefreshBodySchema) })
  @ApiResponse({
    status: 200,
    description: "새로운 Access Token 발급 성공",
    schema: apiSchema(AccessTokenSchema),
  })
  @ApiResponse({ status: 401, description: "유효하지 않은 Refresh Token" })
  @HttpCode(HttpStatus.OK)
  @Post("/refresh")
  refresh(@Body() body: unknown) {
    const { refreshToken } = this.decode(RefreshBodySchema, body);
    return this.runEffect(this.authService.refresh(refreshToken));
  }

  @ApiOperation({
    summary: "로그아웃",
    description: "로그아웃 시 서버에 저장된 Refresh Token을 무효화합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "로그아웃 성공",
    schema: apiSchema(MessageSchema),
  })
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post("/logout")
  logout(@AuthUser() user: User) {
    return this.runEffect(this.authService.logout(user.id));
  }
}
