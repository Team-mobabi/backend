import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Effect } from "effect";
import * as nodemailer from "nodemailer";
import { EmailDeliveryError } from "@src/common/error";

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
}

@Injectable()
export class MailerService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string | undefined;

  constructor(configService: ConfigService) {
    this.from = configService.get<string>("EMAIL_FROM");
    this.transporter = nodemailer.createTransport({
      host: configService.get<string>("EMAIL_HOST"),
      port: configService.get<number>("EMAIL_PORT"),
      secure: configService.get<string>("EMAIL_SECURE") === "true",
      auth: {
        user: configService.get<string>("EMAIL_USER"),
        pass: configService.get<string>("EMAIL_PASSWORD"),
      },
    });
  }

  send(message: MailMessage): Effect.Effect<void, EmailDeliveryError> {
    return Effect.tryPromise({
      try: () => this.transporter.sendMail({ from: this.from, ...message }),
      catch: (error) =>
        new EmailDeliveryError({
          message: "이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
          originalError: error,
        }),
    }).pipe(Effect.asVoid);
  }
}
