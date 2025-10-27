import { Controller, Get, Patch, Delete, UseGuards, Request, Query, Body } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { Request as ExpressRequest } from "express";
import { UsersService } from "@src/users/users.service";
import { AuthGuard } from "@nestjs/passport";
import { User } from "@src/users/entities/user.entity";
import { ChangePasswordDto } from "@src/users/dto/change-password.dto";

@ApiTags("Users")
@ApiBearerAuth("JWT-auth")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: "내 정보 조회" })
  @ApiResponse({ status: 200, description: "사용자 정보 반환", type: User })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @UseGuards(AuthGuard("jwt"))
  @Get("/me")
  getMyInfo(@Request() req: ExpressRequest): Promise<User | null> {
    const user = req.user as User;
    const userId = user.id;

    return this.usersService.findUserById(userId);
  }

  @ApiOperation({ summary: "사용자 검색" })
  @ApiQuery({ name: "q", description: "검색 쿼리 (이메일)", example: "user@example.com" })
  @ApiResponse({ status: 200, description: "검색 결과 반환", type: [User] })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @UseGuards(AuthGuard("jwt"))
  @Get("/search")
  searchUsers(@Query("q") query: string): Promise<User[]> {
    return this.usersService.searchUsers(query);
  }

  @ApiOperation({
    summary: "비밀번호 변경",
    description: "현재 비밀번호를 확인한 후 새 비밀번호로 변경합니다."
  })
  @ApiResponse({
    status: 200,
    description: "비밀번호 변경 성공",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", example: "비밀번호가 성공적으로 변경되었습니다." }
      }
    }
  })
  @ApiResponse({ status: 401, description: "인증 실패 또는 현재 비밀번호 불일치" })
  @ApiResponse({ status: 404, description: "사용자를 찾을 수 없음" })
  @UseGuards(AuthGuard("jwt"))
  @Patch("/password")
  changePassword(
    @Request() req: ExpressRequest,
    @Body() changePasswordDto: ChangePasswordDto
  ): Promise<{ message: string }> {
    const user = req.user as User;
    const userId = user.id;

    return this.usersService.updatePassword(
      userId,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword
    );
  }

  @ApiOperation({
    summary: "회원 탈퇴",
    description: "현재 사용자의 계정을 영구적으로 삭제합니다."
  })
  @ApiResponse({
    status: 200,
    description: "회원 탈퇴 성공",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", example: "회원 탈퇴가 완료되었습니다." }
      }
    }
  })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 404, description: "사용자를 찾을 수 없음" })
  @UseGuards(AuthGuard("jwt"))
  @Delete("/me")
  deleteAccount(@Request() req: ExpressRequest): Promise<{ message: string }> {
    const user = req.user as User;
    const userId = user.id;

    return this.usersService.deleteUser(userId);
  }
}
