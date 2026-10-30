import { Either, Schema } from "effect";
import { NonRootRepoPathSchema } from "@src/domain/file/repo-path";

// ── AI 도우미 ──

export const AskQuestionBodySchema = Schema.Struct({
  question: Schema.NonEmptyString.annotations({
    description: "Git에 대한 질문",
    examples: ["브랜치가 뭔가요?"],
  }),
});

export const AssistantAnswerSchema = Schema.Struct({
  success: Schema.Literal(true),
  answer: Schema.String,
  suggestedActions: Schema.optional(Schema.Array(Schema.String)),
  relatedConcepts: Schema.optional(Schema.Array(Schema.String)),
});

export interface AssistantAnswer {
  readonly answer: string;
  readonly suggestedActions?: readonly string[];
  readonly relatedConcepts?: readonly string[];
}

export interface GitContext {
  readonly currentBranch?: string;
  readonly branches?: readonly string[];
  readonly hasUncommittedChanges?: boolean;
  readonly hasConflicts?: boolean;
  readonly recentCommits?: ReadonlyArray<{
    hash: string;
    message: string;
    author: string;
  }>;
  readonly stagingArea?: readonly string[];
  readonly workingDirectory?: readonly string[];
}

const stripBullets = (text: string): string => text.replace(/^[*-]\s+/gm, "");

const bulletList = (text: string | undefined): string[] =>
  (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-"))
    .map((line) => line.substring(1).trim())
    .filter((item) => item.length > 0);

/** ANSWER / SUGGESTED_ACTIONS / RELATED_CONCEPTS 형식의 응답 파싱 */
export const parseAssistantAnswer = (text: string): AssistantAnswer => {
  const answer = text.match(
    /ANSWER:\s*([\s\S]*?)(?:\n\nSUGGESTED_ACTIONS:|\nSUGGESTED_ACTIONS:|$)/,
  )?.[1];
  const actions = bulletList(
    text.match(
      /SUGGESTED_ACTIONS:\s*([\s\S]*?)(?:\n\nRELATED_CONCEPTS:|\nRELATED_CONCEPTS:|$)/,
    )?.[1],
  );
  const concepts = bulletList(
    text.match(/RELATED_CONCEPTS:\s*([\s\S]*?)$/)?.[1],
  );

  return {
    answer: stripBullets(
      answer?.trim() ||
        "죄송합니다. 답변을 생성하는 데 문제가 있었습니다. 다시 시도해주세요.",
    ),
    ...(actions.length > 0 && { suggestedActions: actions }),
    ...(concepts.length > 0 && { relatedConcepts: concepts }),
  };
};

// ── AI 충돌 해결 ──

export const ConfidenceLevelSchema = Schema.Literal(
  "VERY_HIGH", // 90-100: 자동 적용 가능
  "HIGH", // 70-89: 검토 후 적용 권장
  "MEDIUM", // 50-69: 수동 검토 필요
  "LOW", // 30-49: 주의 필요
  "VERY_LOW", // 0-29: 수동 해결 강력 권장
);
export type ConfidenceLevel = Schema.Schema.Type<typeof ConfidenceLevelSchema>;

export const confidenceLevel = (score: number): ConfidenceLevel => {
  if (score >= 90) return "VERY_HIGH";
  if (score >= 70) return "HIGH";
  if (score >= 50) return "MEDIUM";
  if (score >= 30) return "LOW";
  return "VERY_LOW";
};

export interface ConflictContext {
  readonly ourBranch?: string;
  readonly theirBranch?: string;
  readonly ourCommitMessage?: string;
  readonly theirCommitMessage?: string;
}

export interface AiResolution {
  readonly resolvedCode: string;
  readonly explanation: string;
  /** 0~1 */
  readonly confidence: number;
  readonly confidenceLevel: ConfidenceLevel;
  readonly requiresReview: boolean;
}

const CONFLICT_MARKERS = ["<<<<<<<", ">>>>>>>", "======="];

export const hasConflictMarkers = (content: string): boolean =>
  CONFLICT_MARKERS.some((marker) => content.includes(marker));

/** MERGED_CODE / EXPLANATION / CONFIDENCE 형식의 응답 파싱. 실패 사유를 Left로 */
export const parseResolution = (
  text: string,
): Either.Either<AiResolution, string> => {
  const resolvedCode =
    text.match(/MERGED_CODE:\s*```[\w-]*\n([\s\S]*?)\n```/)?.[1]?.trim() ?? "";
  if (!resolvedCode) {
    return Either.left("AI가 유효한 해결 코드를 생성하지 못했습니다");
  }
  if (hasConflictMarkers(resolvedCode)) {
    return Either.left(
      "AI가 생성한 코드에 여전히 충돌 마커가 포함되어 있습니다",
    );
  }

  const explanation = stripBullets(
    text
      .match(
        /EXPLANATION:\s*([\s\S]*?)(?:\n\nCONFIDENCE:|\nCONFIDENCE:|$)/,
      )?.[1]
      ?.trim() || "AI가 충돌을 분석하고 해결 방법을 제시했습니다.",
  );
  const score = Math.min(
    100,
    Number.parseInt(text.match(/CONFIDENCE:\s*(\d+)/)?.[1] ?? "50", 10),
  );

  return Either.right({
    resolvedCode,
    explanation,
    confidence: score / 100,
    confidenceLevel: confidenceLevel(score),
    requiresReview: score < 70,
  });
};

/** 원본 충돌의 선언 식별자 중 해결 코드에서 사라진 것 (경고용) */
export const missingIdentifiers = (
  resolvedCode: string,
  originalConflict: string,
): string[] => {
  const clean = originalConflict
    .replace(/<<<<<<< .*/g, "")
    .replace(/=======/g, "")
    .replace(/>>>>>>> .*/g, "");
  const declared = new Set(
    [
      ...clean.matchAll(
        /(?:function|const|let|var|class|interface|type)\s+(\w+)/g,
      ),
    ].map((m) => m[1]),
  );
  return [...declared].filter((id) => !resolvedCode.includes(id));
};

export const AiSuggestBodySchema = Schema.Struct({
  filePath: NonRootRepoPathSchema.annotations({
    description: "충돌이 발생한 파일 경로",
  }),
});

export const AiSuggestResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  suggestion: Schema.String,
  explanation: Schema.String,
  confidence: Schema.Number,
});
