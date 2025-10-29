import { JwtService } from "@nestjs/jwt";
import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { UsersService } from "@src/users/users.service";
import { EmailService } from "@src/email/email.service";
import { SignUpDto } from "@src/auth/dto/sign-up.dto";
import { SignInDto } from "@src/auth/dto/sign-in.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async signUp(signUpDto: SignUpDto): Promise<{ message: string }> {
    const { email, password } = signUpDto;

    const existingUser = await this.usersService.findUserByEmail(email);
    if (existingUser) {
      throw new ConflictException("이미 사용 중인 이메일입니다.");
    }

    const isVerified = await this.emailService.isEmailVerified(email);
    if (!isVerified) {
      throw new BadRequestException(
        "이메일 인증이 필요합니다. 먼저 이메일 인증을 완료해주세요.",
      );
    }

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    await this.usersService.createUser({ email, passwordHash });
    await this.emailService.clearVerifiedEmail(email);

    return { message: "회원가입이 완료되었습니다." };
  }

  async signIn(signInDto: SignInDto): Promise<{ accessToken: string }> {
    const { email, password } = signInDto;
    const user = await this.usersService.findUserByEmail(email);

    if (!user) {
      throw new UnauthorizedException("이메일 또는 비밀번호를 확인해주세요.");
    }

    const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordMatch) {
      throw new UnauthorizedException("이메일 또는 비밀번호를 확인해주세요.");
    }

    const payload = { email: user.email, sub: user.id };

    const accessToken = this.jwtService.sign(payload);

    return { accessToken };
  }
}
