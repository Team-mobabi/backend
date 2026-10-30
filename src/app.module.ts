import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Module } from "@nestjs/common";

import { appConfigValidate } from "@src/app.config";

import { UsersModule } from "@src/users/users.module";
import { ReposModule } from "@src/repos/repos.module";
import { AuthModule } from "@src/auth/auth.module";
import { EmailModule } from "@src/email/email.module";
import { FileModule } from "@src/presentation/file/file.module";

import { Repo } from "@src/repos/entities/repo.entity";
import { PullRequest } from "@src/repos/entities/pull-request.entity";
import { PrReview } from "@src/repos/entities/pr-review.entity";
import { RepoCollaborator } from "@src/repos/entities/repo-collaborator.entity";
import { User } from "@src/users/entities/user.entity";
import { EmailVerification } from "@src/email/entities/email-verification.entity";

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
        entities: [
          Repo,
          PullRequest,
          PrReview,
          RepoCollaborator,
          User,
          EmailVerification,
        ],
        synchronize: configService.get<string>("ENV") !== "prod",
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    ReposModule,
    EmailModule,
    FileModule,
  ],
})
export class AppModule {}
