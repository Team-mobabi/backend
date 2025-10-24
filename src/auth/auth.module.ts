import { Module } from "@nestjs/common";
import { JwtModule, JwtModuleOptions } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import type { StringValue } from "ms";
import { AuthService } from "@src/auth/auth.service";
import { AuthController } from "@src/auth/auth.controller";
import { UsersModule } from "@src/users/users.module";
import { EmailModule } from "@src/email/email.module";
import { JwtStrategy } from "@src/auth/strategies/jwt.strategy";

@Module({
  imports: [
    UsersModule,
    EmailModule,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const expiresIn = configService.get<string>("JWT_EXPIRES_IN") || "1d";
        return {
          secret: configService.get<string>("JWT_SECRET") || "default-secret",
          signOptions: {
            expiresIn: expiresIn as StringValue,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
