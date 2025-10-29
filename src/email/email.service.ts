import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan } from "typeorm";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { EmailVerification } from "@src/email/entities/email-verification.entity";

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(EmailVerification)
    private emailVerificationRepository: Repository<EmailVerification>,
    private configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>("EMAIL_HOST"),
      port: this.configService.get<number>("EMAIL_PORT"),
      secure: this.configService.get<string>("EMAIL_SECURE") === "true",
      auth: {
        user: this.configService.get<string>("EMAIL_USER"),
        pass: this.configService.get<string>("EMAIL_PASSWORD"),
      },
    });
  }

  /**
   * 6자리 랜덤 인증 코드 생성
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * 인증 이메일 발송
   */
  async sendVerificationEmail(email: string): Promise<void> {
    await this.emailVerificationRepository.delete({
      email,
      verified: false,
    });

    const code = this.generateVerificationCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    const verification = this.emailVerificationRepository.create({
      email,
      code,
      expiresAt,
      verified: false,
    });
    await this.emailVerificationRepository.save(verification);

    const mailOptions = {
      from: this.configService.get<string>("EMAIL_FROM"),
      to: email,
      subject: "이메일 인증 코드",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>이메일 인증 코드</h2>
          <p>아래의 인증 코드를 입력해주세요:</p>
          <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px;">
            ${code}
          </div>
          <p style="color: #666; margin-top: 20px;">이 코드는 5분 후에 만료됩니다.</p>
          <p style="color: #666;">본인이 요청하지 않았다면 이 이메일을 무시해주세요.</p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      throw new BadRequestException(
        "이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
    }
  }

  /**
   * 인증 코드 검증
   */
  async verifyCode(email: string, code: string): Promise<boolean> {
    await this.emailVerificationRepository.delete({
      expiresAt: LessThan(new Date()),
    });

    const verification = await this.emailVerificationRepository.findOne({
      where: {
        email,
        code,
        verified: false,
      },
    });

    if (!verification) {
      throw new BadRequestException(
        "유효하지 않은 인증 코드입니다. 다시 확인해주세요.",
      );
    }

    if (verification.expiresAt < new Date()) {
      throw new BadRequestException(
        "인증 코드가 만료되었습니다. 새로운 코드를 요청해주세요.",
      );
    }

    verification.verified = true;
    await this.emailVerificationRepository.save(verification);

    return true;
  }

  /**
   * 이메일 인증 여부 확인
   */
  async isEmailVerified(email: string): Promise<boolean> {
    const verification = await this.emailVerificationRepository.findOne({
      where: {
        email,
        verified: true,
      },
    });

    return !!verification;
  }

  /**
   * 인증 완료된 이메일 기록 삭제 (회원가입 완료 후 호출)
   */
  async clearVerifiedEmail(email: string): Promise<void> {
    await this.emailVerificationRepository.delete({
      email,
      verified: true,
    });
  }
}