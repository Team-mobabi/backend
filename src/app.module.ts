import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Module } from "@nestjs/common";

import { UsersModule } from "@src/users/users.module";
import { ReposModule } from "@src/repos/repos.module";
import { AuthModule } from "@src/auth/auth.module";
import { EmailModule } from "@src/email/email.module";

import { Repo } from "@src/repos/entities/repo.entity";
import { PullRequest } from "@src/repos/entities/pull-request.entity";
import { PrReview } from "@src/repos/entities/pr-review.entity";
import { User } from "@src/users/entities/user.entity";
import { EmailVerification } from "@src/email/entities/email-verification.entity";

import * as Joi from "joi";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        ENV: Joi.string().required().valid("dev", "prod"),

        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().required(),

        DB_TYPE: Joi.string().required().valid("postgres"),
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().required(),
        DB_USERNAME: Joi.string().required(),
        DB_PASSWORD: Joi.string().required(),
        DB_DATABASE: Joi.string().required(),

        EMAIL_HOST: Joi.string().required(),
        EMAIL_PORT: Joi.number().required(),
        EMAIL_SECURE: Joi.string().required().valid("true", "false"),
        EMAIL_USER: Joi.string().required(),
        EMAIL_PASSWORD: Joi.string().required(),
        EMAIL_FROM: Joi.string().required(),
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: configService.get<string>("DB_TYPE") as "postgres",
        host: configService.get<string>("DB_HOST"),
        port: Number.parseInt(configService.get<string>("DB_PORT") || "15432"),
        username: configService.get<string>("DB_USERNAME"),
        password: configService.get<string>("DB_PASSWORD"),
        database: configService.get<string>("DB_DATABASE"),
        entities: [Repo, PullRequest, PrReview, User, EmailVerification],
        synchronize: configService.get<string>("ENV") !== "prod",
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    ReposModule,
    EmailModule,
  ],
})
export class AppModule {}
