import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Effect, Option, type Schema } from "effect";
import { type FindOptionsWhere, Like, Repository } from "typeorm";
import type { DbError } from "@src/common/error";
import {
  type User,
  type UserAccount,
  UserAccountSchema,
  UserSchema,
} from "@src/domain/user/user";
import { User as UserEntity } from "@src/infrastructure/database/entities/user.entity";
import { BaseRepository } from "./base.repository";

// LIKE 패턴의 와일드카드(%, _)와 이스케이프 문자를 리터럴로 취급
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, "\\$&");

@Injectable()
export class UserRepository extends BaseRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {
    super();
  }

  findById(id: string): Effect.Effect<Option.Option<User>, DbError> {
    return this.findOne(UserSchema, { id }, "사용자 조회에 실패했습니다");
  }

  findAccountById(
    id: string,
  ): Effect.Effect<Option.Option<UserAccount>, DbError> {
    return this.findOne(
      UserAccountSchema,
      { id },
      "사용자 조회에 실패했습니다",
    );
  }

  findAccountByEmail(
    email: string,
  ): Effect.Effect<Option.Option<UserAccount>, DbError> {
    return this.findOne(
      UserAccountSchema,
      { email },
      "사용자 조회에 실패했습니다",
    );
  }

  findByRefreshTokenHash(
    refreshTokenHash: string,
  ): Effect.Effect<Option.Option<User>, DbError> {
    return this.findOne(
      UserSchema,
      { refreshTokenHash },
      "Refresh Token 조회에 실패했습니다",
    );
  }

  searchByEmail(
    query: string,
    limit: number,
  ): Effect.Effect<readonly User[], DbError> {
    return this.query(
      () =>
        this.users.find({
          where: { email: Like(`%${escapeLike(query)}%`) },
          take: limit,
        }),
      "사용자 검색에 실패했습니다",
    ).pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) => this.toModel(UserSchema, row)),
      ),
    );
  }

  create(email: string, passwordHash: string): Effect.Effect<User, DbError> {
    return this.query(
      () => this.users.save(this.users.create({ email, passwordHash })),
      "사용자 생성에 실패했습니다",
    ).pipe(Effect.flatMap((row) => this.toModel(UserSchema, row)));
  }

  updatePasswordHash(
    id: string,
    passwordHash: string,
  ): Effect.Effect<void, DbError> {
    return this.query(
      () => this.users.update(id, { passwordHash }),
      "비밀번호 변경에 실패했습니다",
    ).pipe(Effect.asVoid);
  }

  setRefreshTokenHash(
    id: string,
    refreshTokenHash: string | null,
  ): Effect.Effect<void, DbError> {
    return this.query(
      () => this.users.update(id, { refreshTokenHash }),
      "Refresh Token 저장에 실패했습니다",
    ).pipe(Effect.asVoid);
  }

  delete(id: string): Effect.Effect<void, DbError> {
    return this.query(
      () => this.users.delete(id),
      "사용자 삭제에 실패했습니다",
    ).pipe(Effect.asVoid);
  }

  private findOne<A, I>(
    schema: Schema.Schema<A, I>,
    where: FindOptionsWhere<UserEntity>,
    message: string,
  ): Effect.Effect<Option.Option<A>, DbError> {
    return this.query(() => this.users.findOne({ where }), message).pipe(
      Effect.flatMap((row) =>
        row === null
          ? Effect.succeed(Option.none())
          : this.toModel(schema, row).pipe(Effect.map(Option.some)),
      ),
    );
  }
}
