import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmailVerificationService } from "@src/application/email/email-verification.service";
import { EmailVerification } from "@src/infrastructure/database/entities/email-verification.entity";
import { MailerService } from "@src/infrastructure/email/mailer.service";
import { EmailVerificationRepository } from "@src/infrastructure/repositories/email-verification.repository";
import { EmailController } from "./email.controller";

@Module({
  imports: [TypeOrmModule.forFeature([EmailVerification])],
  controllers: [EmailController],
  providers: [
    EmailVerificationRepository,
    MailerService,
    EmailVerificationService,
  ],
  exports: [EmailVerificationService],
})
export class EmailModule {}
