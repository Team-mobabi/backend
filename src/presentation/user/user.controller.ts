import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { UserService } from "@src/application/user/user.service";
import {
  ChangePasswordBodySchema,
  MessageSchema,
  SearchUsersQuerySchema,
  type User,
  UserListSchema,
  UserSchema,
} from "@src/domain/user/user";
import { JwtAuthGuard } from "@src/infrastructure/auth/jwt-auth.guard";
import { AuthUser } from "@src/presentation/auth/auth-user.decorator";
import { BaseController } from "@src/presentation/base.controller";
import { apiSchema } from "@src/presentation/openapi";

@ApiTags("Users")
@ApiBearerAuth("JWT-auth")
@ApiResponse({ status: 401, description: "인증 실패" })
@Controller("users")
@UseGuards(JwtAuthGuard)
export class UserController extends BaseController {
  protected readonly logger = new Logger(UserController.name);

  constructor(private readonly userService: UserService) {
    super();
  }

  @ApiOperation({ summary: "내 정보 조회" })
  @ApiResponse({
    status: 200,
    description: "사용자 정보 반환",
    schema: apiSchema(UserSchema),
  })
  @Get("/me")
  getMyInfo(@AuthUser() user: User) {
    return this.runEffect(this.userService.getById(user.id));
  }

  @ApiOperation({ summary: "사용자 검색" })
  @ApiQuery({
    name: "q",
    description: "검색 쿼리 (이메일 일부)",
    example: "user@example.com",
  })
  @ApiResponse({
    status: 200,
    description: "검색 결과 반환 (최대 10명)",
    schema: apiSchema(UserListSchema),
  })
  @Get("/search")
  searchUsers(@Query() query: unknown) {
    const { q } = this.decode(SearchUsersQuerySchema, query);
    return this.runEffect(this.userService.search(q));
  }

  @ApiOperation({
    summary: "비밀번호 변경",
    description: "현재 비밀번호를 확인한 후 새 비밀번호로 변경합니다.",
  })
  @ApiBody({ schema: apiSchema(ChangePasswordBodySchema) })
  @ApiResponse({
    status: 200,
    description: "비밀번호 변경 성공",
    schema: apiSchema(MessageSchema),
  })
  @ApiResponse({ status: 401, description: "현재 비밀번호 불일치" })
  @ApiResponse({ status: 404, description: "사용자를 찾을 수 없음" })
  @Patch("/password")
  changePassword(@AuthUser() user: User, @Body() body: unknown) {
    const data = this.decode(ChangePasswordBodySchema, body);
    return this.runEffect(this.userService.changePassword(user.id, data));
  }

  @ApiOperation({
    summary: "회원 탈퇴",
    description: "현재 사용자의 계정을 영구적으로 삭제합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "회원 탈퇴 성공",
    schema: apiSchema(MessageSchema),
  })
  @ApiResponse({ status: 404, description: "사용자를 찾을 수 없음" })
  @Delete("/me")
  deleteAccount(@AuthUser() user: User) {
    return this.runEffect(this.userService.delete(user.id));
  }
}
