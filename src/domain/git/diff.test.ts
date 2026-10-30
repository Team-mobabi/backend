import { describe, expect, it } from "vitest";
import { parseDiffOutput, parseNameStatus, parseNumstat } from "./diff";

const SAMPLE = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
 export { a, b };
diff --git a/img.png b/img.png
index 3333333..4444444 100644
Binary files a/img.png and b/img.png differ
`;

describe("parseDiffOutput", () => {
  it("텍스트 diff의 추가/삭제와 전후 내용을 계산한다", () => {
    const [text, binary] = parseDiffOutput(SAMPLE);
    expect(text).toMatchObject({
      path: "src/a.ts",
      additions: 1,
      deletions: 1,
      isBinary: false,
      oldContent: "const a = 1;\nconst b = 2;\nexport { a, b };",
      newContent: "const a = 1;\nconst b = 3;\nexport { a, b };",
    });
    expect(binary).toMatchObject({ path: "img.png", isBinary: true });
  });

  it("빈 출력은 빈 배열", () => {
    expect(parseDiffOutput("  \n")).toEqual([]);
  });
});

describe("parseNameStatus / parseNumstat", () => {
  it("상태 코드를 이름으로 바꾼다", () => {
    expect(parseNameStatus("M\ta.ts\nA\tb.ts\nX\tc.ts")).toEqual([
      { path: "a.ts", status: "modified" },
      { path: "b.ts", status: "added" },
      { path: "c.ts", status: "X" },
    ]);
    expect(parseNameStatus("")).toEqual([]);
  });

  it("numstat 합계를 내고 바이너리는 0으로 센다", () => {
    expect(parseNumstat("3\t1\ta.ts\n-\t-\timg.png")).toEqual({
      files: 2,
      additions: 3,
      deletions: 1,
      fileStats: [
        { path: "a.ts", additions: 3, deletions: 1 },
        { path: "img.png", additions: 0, deletions: 0 },
      ],
    });
    expect(parseNumstat("")).toMatchObject({ files: 0 });
  });
});
