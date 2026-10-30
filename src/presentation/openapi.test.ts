import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { UploadResultSchema } from "@src/domain/file/file";
import { apiSchema } from "./openapi";

describe("apiSchema", () => {
  it("$schema/$defs/$ref 없이 인라인된 스키마를 만든다", () => {
    const json = JSON.stringify(apiSchema(UploadResultSchema));
    expect(json).not.toContain("$ref");
    expect(json).not.toContain("$defs");
    expect(json).not.toContain("$schema");
  });

  it("Date는 date-time 문자열로 표현한다", () => {
    const schema = apiSchema(Schema.Struct({ at: Schema.Date }));
    expect(schema.properties?.at).toEqual({
      type: "string",
      format: "date-time",
    });
  });
});
