import { createHash } from "node:crypto";

/**
 * DB에는 refresh 토큰 원문 대신 SHA-256 해시만 저장한다. 토큰 자체가 서명된
 * 고엔트로피 JWT라 salt 없이도 역산할 수 없고, 해시값으로 바로 조회할 수 있다.
 */
export const hashRefreshToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
