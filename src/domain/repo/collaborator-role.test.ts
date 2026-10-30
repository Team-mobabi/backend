import { describe, expect, it } from "vitest";
import { type CollaboratorRole, roleSatisfies } from "./collaborator-role";

describe("roleSatisfies", () => {
  it.each<[CollaboratorRole, CollaboratorRole, boolean]>([
    ["read", "read", true],
    ["read", "write", false],
    ["read", "admin", false],
    ["write", "read", true],
    ["write", "write", true],
    ["write", "admin", false],
    ["admin", "read", true],
    ["admin", "admin", true],
  ])("%s 권한은 %s 요구를 만족하는가 → %s", (role, required, expected) => {
    expect(roleSatisfies(role, required)).toBe(expected);
  });
});
