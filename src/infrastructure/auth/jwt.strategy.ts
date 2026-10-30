import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Effect, Option, Schema } from "effect";
import { ExtractJwt, Strategy } from "passport-jwt";
import { TokenPayloadSchema } from "@src/domain/auth/auth";
import type { User } from "@src/domain/user/user";
import { UserRepository } from "@src/infrastructure/repositories/user.repository";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly userRepository: UserRepository,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_SECRET"),
    });
  }

  async validate(payload: unknown): Promise<User> {
    const decoded = Schema.decodeUnknownOption(TokenPayloadSchema)(payload);
    if (Option.isNone(decoded) || decoded.value.type === "refresh") {
      throw new UnauthorizedException();
    }

    const user = await Effect.runPromise(
      this.userRepository.findById(decoded.value.sub),
    );
    if (Option.isNone(user)) {
      throw new UnauthorizedException();
    }
    return user.value;
  }
}
