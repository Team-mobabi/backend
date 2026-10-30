import { Injectable } from "@nestjs/common";
import { Effect } from "effect";
import { RepoWorkspaceService } from "@src/application/repo/repo-workspace.service";
import type { AiError, DbError, RepoError } from "@src/common/error";
import {
  type AssistantAnswer,
  type GitContext,
  parseAssistantAnswer,
} from "@src/domain/ai/ai";
import { ClaudeClient } from "@src/infrastructure/ai/claude.client";
import { tryGit } from "@src/infrastructure/git/git";
import { askQuestionPrompt, suggestNextPrompt } from "./prompts";

type Failure = AiError | RepoError | DbError;

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly workspaces: RepoWorkspaceService,
    private readonly claude: ClaudeClient,
  ) {}

  ask(
    repoId: string,
    userId: string,
    question: string,
  ): Effect.Effect<AssistantAnswer, Failure> {
    return this.context(repoId, userId).pipe(
      Effect.flatMap((context) =>
        this.claude.complete({
          prompt: askQuestionPrompt(question, context),
          effort: "low",
        }),
      ),
      Effect.map(parseAssistantAnswer),
    );
  }

  suggestNext(
    repoId: string,
    userId: string,
  ): Effect.Effect<AssistantAnswer, Failure> {
    return this.context(repoId, userId).pipe(
      Effect.flatMap((context) =>
        this.claude.complete({
          prompt: suggestNextPrompt(context),
          effort: "low",
        }),
      ),
      Effect.map(parseAssistantAnswer),
    );
  }

  /**
   * 권한은 반드시 확인하되, git 상태 수집이 실패하면 상태 없이 답변한다.
   * (기존에는 권한 실패까지 삼켜서 접근 권한이 없는 레포로도 AI 호출이 가능했다)
   */
  private context(
    repoId: string,
    userId: string,
  ): Effect.Effect<GitContext, RepoError | DbError> {
    return this.workspaces.authorize(repoId, userId).pipe(
      Effect.zipRight(
        this.workspaces.open(repoId, userId).pipe(
          Effect.flatMap(({ git }) =>
            Effect.all([
              tryGit("status", () => git.status()),
              tryGit("branch", () => git.branchLocal()),
              tryGit("log", () => git.log({ maxCount: 5 })),
            ]),
          ),
          Effect.map(
            ([status, branches, log]): GitContext => ({
              currentBranch: status.current ?? undefined,
              branches: branches.all,
              hasUncommittedChanges:
                status.modified.length > 0 ||
                status.created.length > 0 ||
                status.deleted.length > 0,
              hasConflicts: status.conflicted.length > 0,
              stagingArea: status.staged,
              workingDirectory: [
                ...status.modified,
                ...status.created,
                ...status.deleted,
              ],
              recentCommits: log.all.map((commit) => ({
                hash: commit.hash,
                message: commit.message,
                author: commit.author_name,
              })),
            }),
          ),
          Effect.orElseSucceed((): GitContext => ({})),
        ),
      ),
    );
  }
}
