import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "@src/application/auth/auth.service";
import { JwtStrategy } from "@src/infrastructure/auth/jwt.strategy";
import { EmailModule } from "@src/presentation/email/email.module";
import { UserModule } from "@src/presentation/user/user.module";
import { AuthController } from "./auth.controller";

@Module({
  imports: [
    UserModule,
    EmailModule,
    PassportModule,
    // 만료 시간은 토큰 종류별로 AuthService에서 지정한다
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>("JWT_SECRET"),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
