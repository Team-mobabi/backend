import { Module } from "@nestjs/common";
import { AiAssistantService } from "@src/application/ai/ai-assistant.service";
import { ConflictResolverService } from "@src/application/ai/conflict-resolver.service";
import { ConflictService } from "@src/application/conflict/conflict.service";
import { RepoWorkspaceModule } from "@src/application/repo/repo-workspace.module";
import { ClaudeClient } from "@src/infrastructure/ai/claude.client";
import { AiAssistantController } from "./ai-assistant.controller";
import { ConflictController } from "./conflict.controller";

@Module({
  imports: [RepoWorkspaceModule],
  controllers: [ConflictController, AiAssistantController],
  providers: [
    ClaudeClient,
    ConflictResolverService,
    AiAssistantService,
    ConflictService,
  ],
})
export class ConflictModule {}
