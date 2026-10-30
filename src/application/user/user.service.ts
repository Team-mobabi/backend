import { Injectable } from "@nestjs/common";
import { Effect } from "effect";
import { getOrFail } from "@src/common/effect";
import {
  type DbError,
  InvalidCredentialsError,
  UserNotFoundError,
} from "@src/common/error";
import type { ChangePasswordBody, Message, User } from "@src/domain/user/user";
import {
  hashPassword,
  verifyPassword,
} from "@src/infrastructure/auth/password";
import { UserRepository } from "@src/infrastructure/repositories/user.repository";

const SEARCH_LIMIT = 10;

const notFound = () =>
  new UserNotFoundError({ message: "사용자를 찾을 수 없습니다." });

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  getById(id: string): Effect.Effect<User, UserNotFoundError | DbError> {
    return this.userRepository.findById(id).pipe(getOrFail(notFound));
  }

  search(query: string): Effect.Effect<readonly User[], DbError> {
    return this.userRepository.searchByEmail(query, SEARCH_LIMIT);
  }

  changePassword(
    id: string,
    body: ChangePasswordBody,
  ): Effect.Effect<
    Message,
    UserNotFoundError | InvalidCredentialsError | DbError
  > {
    return this.userRepository.findAccountById(id).pipe(
      getOrFail(notFound),
      Effect.flatMap((account) =>
        verifyPassword(body.currentPassword, account.passwordHash),
      ),
      Effect.filterOrFail(
        (matched) => matched,
        () =>
          new InvalidCredentialsError({
            message: "현재 비밀번호가 일치하지 않습니다.",
          }),
      ),
      Effect.zipRight(hashPassword(body.newPassword)),
      Effect.flatMap((hash) =>
        this.userRepository.updatePasswordHash(id, hash),
      ),
      Effect.as({ message: "비밀번호가 성공적으로 변경되었습니다." }),
    );
  }

  delete(id: string): Effect.Effect<Message, UserNotFoundError | DbError> {
    return this.getById(id).pipe(
      Effect.zipRight(this.userRepository.delete(id)),
      Effect.as({ message: "회원 탈퇴가 완료되었습니다." }),
    );
  }
}
