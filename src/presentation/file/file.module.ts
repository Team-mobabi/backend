import { Module } from "@nestjs/common";
import { FileService } from "@src/application/file/file.service";
import { RepoWorkspaceModule } from "@src/application/repo/repo-workspace.module";
import { FileController } from "./file.controller";

@Module({
  imports: [RepoWorkspaceModule],
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
