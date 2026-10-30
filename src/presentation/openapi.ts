import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { JSONSchema, type Schema } from "effect";

type Json = { [key: string]: unknown };

const DEFINITION_OVERRIDES: Record<string, unknown> = {
  Date: { type: "string", format: "date-time" },
};

const REF_PREFIX = "#/$defs/";

const inlineRefs = (node: unknown, defs: Record<string, unknown>): unknown => {
  if (Array.isArray(node)) return node.map((item) => inlineRefs(item, defs));
  if (node === null || typeof node !== "object") return node;

  const obj = node as Json;
  if (typeof obj.$ref === "string" && obj.$ref.startsWith(REF_PREFIX)) {
    const name = obj.$ref.slice(REF_PREFIX.length);
    return inlineRefs(DEFINITION_OVERRIDES[name] ?? defs[name], defs);
  }
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, inlineRefs(value, defs)]),
  );
};

/**
 * Effect Schema → Swagger SchemaObject.
 * 요청/응답 스키마를 한 곳(domain)에서만 정의하고 문서는 여기서 파생시킨다.
 * 재귀 스키마는 지원하지 않는다.
 */
export const apiSchema = <A, I>(schema: Schema.Schema<A, I>): SchemaObject => {
  const { $schema: _, $defs = {}, ...root } = JSONSchema.make(schema);
  // JSON Schema draft-07과 OpenAPI 3.0 SchemaObject는 이 범위에서 호환된다
  return inlineRefs(root, $defs) as SchemaObject;
};
