import { Repository, Like } from "typeorm";
import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { User } from "@src/users/entities/user.entity";
import * as bcrypt from "bcrypt";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async createUser(userData: {
    email: string;
    passwordHash: string;
  }): Promise<User> {
    const newUser = this.usersRepository.create(userData);
    return this.usersRepository.save(newUser);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async searchUsers(query: string): Promise<User[]> {
    return this.usersRepository.find({
      where: { email: Like(`%${query}%`) },
      take: 10,
    });
  }

  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.findUserById(userId);

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    const isPasswordMatch = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );

    if (!isPasswordMatch) {
      throw new UnauthorizedException("현재 비밀번호가 일치하지 않습니다.");
    }

    const salt = await bcrypt.genSalt();
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    await this.usersRepository.update(userId, { passwordHash: newPasswordHash });

    return { message: "비밀번호가 성공적으로 변경되었습니다." };
  }

  async deleteUser(userId: string): Promise<{ message: string }> {
    const user = await this.findUserById(userId);

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    await this.usersRepository.delete(userId);

    return { message: "회원 탈퇴가 완료되었습니다." };
  }
}
