import { describe, expect, it } from "vitest";
import { hashRefreshToken } from "./refresh-token";

describe("hashRefreshToken", () => {
  it("같은 토큰은 같은 64자 hex 해시가 된다", () => {
    const hash = hashRefreshToken("token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken("token")).toBe(hash);
    expect(hashRefreshToken("token2")).not.toBe(hash);
  });
});
