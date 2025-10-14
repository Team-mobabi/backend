import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EmailController } from "@src/email/email.controller";
import { EmailService } from "@src/email/email.service";
import { EmailVerification } from "@src/email/entities/email-verification.entity";

@Module({
  imports: [TypeOrmModule.forFeature([EmailVerification]), ConfigModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}