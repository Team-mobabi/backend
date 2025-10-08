import { JwtService } from "@nestjs/jwt";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { UsersService } from "@src/users/users.service";
import { SignUpDto } from "@src/auth/dto/sign-up.dto";
import { SignInDto } from "@src/auth/dto/sign-in.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signUp(signUpDto: SignUpDto): Promise<{ message: string }> {
    const { email, password } = signUpDto;

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    await this.usersService.createUser({ email, passwordHash });

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
