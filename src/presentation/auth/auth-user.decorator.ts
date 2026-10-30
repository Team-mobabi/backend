import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { User } from "@src/domain/user/user";

/** JwtStrategy.validate가 request.user에 넣은 인증 사용자 */
export const AuthUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    ctx.switchToHttp().getRequest<Request & { user: User }>().user,
);
