import { Injectable } from "@nestjs/common";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { Effect, Option, Schema } from "effect";
import { EmailVerificationService } from "@src/application/email/email-verification.service";
import { getOrFail } from "@src/common/effect";
import {
  type DbError,
  EmailAlreadyInUseError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from "@src/common/error";
import {
  type AccessToken,
  type SignInBody,
  type SignUpBody,
  type TokenPair,
  type TokenPayload,
  TokenPayloadSchema,
} from "@src/domain/auth/auth";
import type { Message, User } from "@src/domain/user/user";
import {
  hashPassword,
  verifyPassword,
} from "@src/infrastructure/auth/password";
import { hashRefreshToken } from "@src/infrastructure/auth/refresh-token";
import { UserRepository } from "@src/infrastructure/repositories/user.repository";

type Ttl = JwtSignOptions["expiresIn"];
const ACCESS_TOKEN_TTL: Ttl = "1h";
const REFRESH_TOKEN_TTL: Ttl = "4h";

const invalidCredentials = () =>
  new InvalidCredentialsError({
    message: "이메일 또는 비밀번호를 확인해주세요.",
  });

const invalidRefreshToken = () =>
  new InvalidRefreshTokenError({
    message: "유효하지 않은 Refresh Token입니다.",
  });

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailVerification: EmailVerificationService,
    private readonly jwtService: JwtService,
  ) {}

  signUp({
    email,
    password,
  }: SignUpBody): Effect.Effect<
    Message,
    EmailAlreadyInUseError | EmailNotVerifiedError | DbError
  > {
    return Effect.gen(this, function* () {
      const existing = yield* this.userRepository.findAccountByEmail(email);
      if (Option.isSome(existing)) {
        return yield* new EmailAlreadyInUseError({
          message: "이미 사용 중인 이메일입니다.",
        });
      }
      if (!(yield* this.emailVerification.isVerified(email))) {
        return yield* new EmailNotVerifiedError({
          message: "이메일 인증이 필요합니다. 먼저 이메일 인증을 완료해주세요.",
        });
      }

      const passwordHash = yield* hashPassword(password);
      yield* this.userRepository.create(email, passwordHash);
      yield* this.emailVerification.clear(email);
      return { message: "회원가입이 완료되었습니다." };
    });
  }

  signIn({
    email,
    password,
  }: SignInBody): Effect.Effect<TokenPair, InvalidCredentialsError | DbError> {
    return Effect.gen(this, function* () {
      const account = yield* this.userRepository
        .findAccountByEmail(email)
        .pipe(getOrFail(invalidCredentials));
      if (!(yield* verifyPassword(password, account.passwordHash))) {
        return yield* invalidCredentials();
      }

      const tokens = {
        accessToken: this.sign(account, "access", ACCESS_TOKEN_TTL),
        refreshToken: this.sign(account, "refresh", REFRESH_TOKEN_TTL),
      };
      yield* this.userRepository.setRefreshTokenHash(
        account.id,
        hashRefreshToken(tokens.refreshToken),
      );
      return tokens;
    });
  }

  refresh(
    refreshToken: string,
  ): Effect.Effect<AccessToken, InvalidRefreshTokenError | DbError> {
    return Effect.gen(this, function* () {
      const payload = yield* this.verify(refreshToken);
      // 로그아웃 등으로 서버에서 폐기된 토큰인지 확인
      const user = yield* this.userRepository
        .findByRefreshTokenHash(hashRefreshToken(refreshToken))
        .pipe(getOrFail(invalidRefreshToken));
      if (user.id !== payload.sub) {
        return yield* invalidRefreshToken();
      }
      return { accessToken: this.sign(user, "access", ACCESS_TOKEN_TTL) };
    });
  }

  logout(userId: string): Effect.Effect<Message, DbError> {
    return this.userRepository
      .setRefreshTokenHash(userId, null)
      .pipe(Effect.as({ message: "로그아웃되었습니다." }));
  }

  private sign(
    user: Pick<User, "id" | "email">,
    type: "access" | "refresh",
    expiresIn: Ttl,
  ): string {
    const payload: TokenPayload = { sub: user.id, email: user.email, type };
    return this.jwtService.sign(payload, { expiresIn });
  }

  private verify(
    token: string,
  ): Effect.Effect<TokenPayload, InvalidRefreshTokenError> {
    return Effect.try({
      try: () => this.jwtService.verify<object>(token),
      catch: invalidRefreshToken,
    }).pipe(
      Effect.flatMap((raw) =>
        Schema.decodeUnknown(TokenPayloadSchema)(raw).pipe(
          Effect.mapError(invalidRefreshToken),
        ),
      ),
      // 이 필드 도입 전 발급된 refresh 토큰(type 없음)은 DB 대조로만 검증된다
      Effect.filterOrFail(
        (payload) => payload.type !== "access",
        invalidRefreshToken,
      ),
    );
  }
}
