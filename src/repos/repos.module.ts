import { Module } from '@nestjs/common';
import { ReposService } from '@src/repos/repos.service';
import { ReposController } from '@src/repos/repos.controller';
import {TypeOrmModule} from "@nestjs/typeorm";
import {Repo} from "@src/repos/entities/repo.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Repo])
  ],
  controllers: [ReposController],
  providers: [ReposService],
  exports: [ReposService]
})
export class ReposModule {}
