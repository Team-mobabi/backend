import { Controller, Get, UseGuards, Request } from "@nestjs/common";
import { Request as ExpressRequest } from "express";
import { UsersService } from "./users.service";
import { AuthGuard } from "@nestjs/passport";
import { User } from "./entities/user.entity";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(AuthGuard("jwt"))
  @Get("/me")
  getMyInfo(@Request() req: ExpressRequest): Promise<User | null> {
    const user = req.user as User;
    const userId = user.id;

    return this.usersService.findUserById(userId);
  }
}
