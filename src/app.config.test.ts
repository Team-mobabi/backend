import { describe, expect, it } from "vitest";
import { appConfigValidate } from "./app.config";

const validEnv = {
  ENV: "dev",
  JWT_SECRET: "secret",
  JWT_EXPIRES_IN: "1h",
  DB_TYPE: "postgres",
  DB_HOST: "localhost",
  DB_PORT: "15432",
  DB_USERNAME: "user",
  DB_PASSWORD: "pass",
  DB_DATABASE: "db",
  EMAIL_HOST: "smtp.example.com",
  EMAIL_PORT: "587",
  EMAIL_SECURE: "false",
  EMAIL_USER: "user@example.com",
  EMAIL_PASSWORD: "pass",
  EMAIL_FROM: "user@example.com",
};

describe("appConfigValidate", () => {
  it("문자열 포트를 숫자로 변환하고 PORT 기본값을 채운다", () => {
    const config = appConfigValidate(validEnv);
    expect(config.DB_PORT).toBe(15432);
    expect(config.EMAIL_PORT).toBe(587);
    expect(config.PORT).toBe(3000);
  });

  it("EMAIL_SECURE는 기존 소비 코드와 맞추기 위해 문자열로 유지한다", () => {
    expect(appConfigValidate(validEnv).EMAIL_SECURE).toBe("false");
  });

  it("CLAUDE_API_KEY는 선택값이다", () => {
    expect(appConfigValidate(validEnv).CLAUDE_API_KEY).toBeUndefined();
  });

  it("필수값 누락과 잘못된 값을 한 번에 보고한다", () => {
    const { JWT_SECRET: _, ...rest } = validEnv;
    expect(() => appConfigValidate({ ...rest, ENV: "staging" })).toThrow(
      /JWT_SECRET[\s\S]*ENV|ENV[\s\S]*JWT_SECRET/,
    );
  });

  it("관계없는 환경변수는 무시한다", () => {
    expect(() =>
      appConfigValidate({ ...validEnv, PATH: "/usr/bin" }),
    ).not.toThrow();
  });
});
