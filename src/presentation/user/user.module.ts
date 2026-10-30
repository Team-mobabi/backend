import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserService } from "@src/application/user/user.service";
import { User } from "@src/infrastructure/database/entities/user.entity";
import { UserRepository } from "@src/infrastructure/repositories/user.repository";
import { UserController } from "./user.controller";

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserRepository, UserService],
  exports: [UserRepository],
})
export class UserModule {}
