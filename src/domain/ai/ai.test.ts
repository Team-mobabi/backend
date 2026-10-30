import { Either } from "effect";
import { describe, expect, it } from "vitest";
import { testCases } from "@src/application/ai/evaluation/conflict-test-cases";
import {
  confidenceLevel,
  hasConflictMarkers,
  missingIdentifiers,
  parseAssistantAnswer,
  parseResolution,
} from "./ai";

describe("parseResolution", () => {
  it("코드, 설명, 신뢰도를 파싱한다", () => {
    const result = parseResolution(`MERGED_CODE:
\`\`\`js
const API_TIMEOUT = 10000;
\`\`\`

EXPLANATION:
- 더 긴 타임아웃을 선택했습니다.

CONFIDENCE: 95`);
    expect(result).toEqual(
      Either.right({
        resolvedCode: "const API_TIMEOUT = 10000;",
        explanation: "더 긴 타임아웃을 선택했습니다.",
        confidence: 0.95,
        confidenceLevel: "VERY_HIGH",
        requiresReview: false,
      }),
    );
  });

  it("신뢰도가 없으면 50으로 보고 검토가 필요하다고 표시한다", () => {
    const result = parseResolution("MERGED_CODE:\n```ts\nx\n```");
    expect(Either.getOrThrow(result)).toMatchObject({
      confidence: 0.5,
      confidenceLevel: "MEDIUM",
      requiresReview: true,
    });
  });

  it("코드 블록이 없거나 충돌 마커가 남아 있으면 실패한다", () => {
    expect(
      Either.isLeft(parseResolution("EXPLANATION: 설명\nCONFIDENCE: 50")),
    ).toBe(true);
    const withMarkers = parseResolution(
      "MERGED_CODE:\n```js\n<<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\n```",
    );
    expect(withMarkers).toEqual(
      Either.left("AI가 생성한 코드에 여전히 충돌 마커가 포함되어 있습니다"),
    );
  });
});

describe("confidenceLevel", () => {
  it.each([
    [95, "VERY_HIGH"],
    [90, "VERY_HIGH"],
    [75, "HIGH"],
    [50, "MEDIUM"],
    [35, "LOW"],
    [10, "VERY_LOW"],
  ] as const)("%i → %s", (score, level) => {
    expect(confidenceLevel(score)).toBe(level);
  });
});

describe("missingIdentifiers", () => {
  const conflict = `<<<<<<< HEAD
const myVariable = 1;
function myFunction() {}
=======
const myVariable = 2;
function myFunction() {}
>>>>>>> feature`;

  it("보존된 식별자는 보고하지 않는다", () => {
    expect(
      missingIdentifiers(
        "const myVariable = 2;\nfunction myFunction() {}",
        conflict,
      ),
    ).toEqual([]);
  });

  it("누락된 식별자를 찾는다", () => {
    expect(missingIdentifiers("const otherVariable = 2;", conflict)).toEqual([
      "myVariable",
      "myFunction",
    ]);
  });
});

describe("parseAssistantAnswer", () => {
  it("답변/행동/개념 섹션을 나누고 불릿을 정리한다", () => {
    const parsed = parseAssistantAnswer(`ANSWER:
- 커밋은 저장입니다.

SUGGESTED_ACTIONS:
- 변경 파일 추가하기
- 커밋하기

RELATED_CONCEPTS:
- 스테이징`);
    expect(parsed).toEqual({
      answer: "커밋은 저장입니다.",
      suggestedActions: ["변경 파일 추가하기", "커밋하기"],
      relatedConcepts: ["스테이징"],
    });
  });

  it("형식이 깨지면 기본 안내 문구를 돌려준다", () => {
    expect(parseAssistantAnswer("??").answer).toMatch(/^죄송합니다/);
  });
});

describe("평가용 테스트 케이스 데이터", () => {
  it("모든 케이스가 필수 필드와 충돌 마커를 가지고, 기대 결과에는 마커가 없다", () => {
    for (const tc of testCases) {
      expect(tc.id && tc.conflict && tc.expectedResolution).toBeTruthy();
      expect(tc.minConfidence).toBeGreaterThanOrEqual(0);
      expect(hasConflictMarkers(tc.conflict)).toBe(true);
      expect(hasConflictMarkers(tc.expectedResolution)).toBe(false);
    }
  });
});
