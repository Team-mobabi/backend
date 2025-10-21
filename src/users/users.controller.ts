import { Controller, Get, UseGuards, Request, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { Request as ExpressRequest } from "express";
import { UsersService } from "@src/users/users.service";
import { AuthGuard } from "@nestjs/passport";
import { User } from "@src/users/entities/user.entity";

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
}
