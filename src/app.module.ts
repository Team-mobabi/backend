import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Module } from "@nestjs/common";

import { appConfigValidate } from "@src/app.config";

import { UserModule } from "@src/presentation/user/user.module";
import { ReposModule } from "@src/repos/repos.module";
import { AuthModule } from "@src/presentation/auth/auth.module";
import { EmailModule } from "@src/presentation/email/email.module";
import { FileModule } from "@src/presentation/file/file.module";

import { Repo } from "@src/infrastructure/database/entities/repo.entity";
import { PullRequest } from "@src/infrastructure/database/entities/pull-request.entity";
import { PrReview } from "@src/infrastructure/database/entities/pr-review.entity";
import { RepoCollaborator } from "@src/infrastructure/database/entities/repo-collaborator.entity";
import { User } from "@src/infrastructure/database/entities/user.entity";
import { EmailVerification } from "@src/infrastructure/database/entities/email-verification.entity";

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
    UserModule,
    ReposModule,
    EmailModule,
    FileModule,
  ],
})
export class AppModule {}
