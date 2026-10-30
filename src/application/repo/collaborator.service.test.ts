import { Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollaboratorRepository } from "@src/infrastructure/repositories/collaborator.repository";
import type { UserRepository } from "@src/infrastructure/repositories/user.repository";
import { CollaboratorService } from "./collaborator.service";
import type { RepoWorkspaceService } from "./repo-workspace.service";

const tagOf = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit) && exit.cause._tag === "Fail"
    ? exit.cause.error._tag
    : undefined;

describe("CollaboratorService.add", () => {
  let collaborators: Record<string, ReturnType<typeof vi.fn>>;
  let users: Record<string, ReturnType<typeof vi.fn>>;
  let service: CollaboratorService;

  beforeEach(() => {
    collaborators = {
      find: vi.fn(() => Effect.succeed(Option.none())),
      create: vi.fn(() => Effect.succeed({ id: "c1" })),
    };
    users = {
      findById: vi.fn(() => Effect.succeed(Option.some({ id: "u2" }))),
    };
    const workspaces = {
      authorize: vi.fn(() => Effect.succeed({ ownerId: "owner" })),
    };
    service = new CollaboratorService(
      workspaces as unknown as RepoWorkspaceService,
      collaborators as unknown as CollaboratorRepository,
      users as unknown as UserRepository,
    );
  });

  const add = (userId: string) =>
    Effect.runPromiseExit(
      service.add("r1", "owner", { userId, role: "write" }),
    );

  it("소유자는 협업자로 추가할 수 없다", async () => {
    expect(tagOf(await add("owner"))).toBe("CollaboratorConflictError");
  });

  it("없는 사용자는 404 (FK 오류로 500이 나지 않게)", async () => {
    users.findById.mockReturnValueOnce(Effect.succeed(Option.none()));
    expect(tagOf(await add("ghost"))).toBe("UserNotFoundError");
    expect(collaborators.create).not.toHaveBeenCalled();
  });

  it("이미 협업자면 409", async () => {
    collaborators.find.mockReturnValueOnce(
      Effect.succeed(Option.some({ id: "c0" })),
    );
    expect(tagOf(await add("u2"))).toBe("CollaboratorConflictError");
  });

  it("정상 추가", async () => {
    expect(Exit.isSuccess(await add("u2"))).toBe(true);
    expect(collaborators.create).toHaveBeenCalledWith("r1", "u2", "write");
  });
});
