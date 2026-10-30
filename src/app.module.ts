import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Module } from "@nestjs/common";

import { appConfigValidate } from "@src/app.config";

import { UserModule } from "@src/presentation/user/user.module";
import { AuthModule } from "@src/presentation/auth/auth.module";
import { EmailModule } from "@src/presentation/email/email.module";
import { FileModule } from "@src/presentation/file/file.module";
import { RepoModule } from "@src/presentation/repo/repo.module";
import { GitModule } from "@src/presentation/git/git.module";
import { PullRequestModule } from "@src/presentation/pull-request/pull-request.module";
import { ConflictModule } from "@src/presentation/conflict/conflict.module";

import { ENTITIES } from "@src/infrastructure/database/entities";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: appConfigValidate,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: configService.get<string>("DB_TYPE") as "postgres",
        host: configService.get<string>("DB_HOST"),
        port: configService.get<number>("DB_PORT"),
        username: configService.get<string>("DB_USERNAME"),
        password: configService.get<string>("DB_PASSWORD"),
        database: configService.get<string>("DB_DATABASE"),
        entities: ENTITIES,
        synchronize: configService.get<string>("ENV") !== "prod",
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UserModule,
    EmailModule,
    FileModule,
    RepoModule,
    GitModule,
    PullRequestModule,
    ConflictModule,
  ],
})
export class AppModule {}
