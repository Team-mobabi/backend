import { Schema } from "effect";

export const FileDiffSchema = Schema.Struct({
  path: Schema.String,
  oldContent: Schema.String,
  newContent: Schema.String,
  diff: Schema.String,
  additions: Schema.Number,
  deletions: Schema.Number,
  isBinary: Schema.Boolean,
});
export type FileDiff = Schema.Schema.Type<typeof FileDiffSchema>;
export const FileDiffListSchema = Schema.Array(FileDiffSchema);

export const ChangedFileSchema = Schema.Struct({
  path: Schema.String,
  status: Schema.String,
});
export type ChangedFile = Schema.Schema.Type<typeof ChangedFileSchema>;
export const ChangedFileListSchema = Schema.Array(ChangedFileSchema);

export const DiffStatsSchema = Schema.Struct({
  files: Schema.Number,
  additions: Schema.Number,
  deletions: Schema.Number,
  fileStats: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      additions: Schema.Number,
      deletions: Schema.Number,
    }),
  ),
});
export type DiffStats = Schema.Schema.Type<typeof DiffStatsSchema>;

/** `git diff` 출력 → 파일별 diff */
export const parseDiffOutput = (output: string): FileDiff[] => {
  if (output.trim() === "") return [];

  return output
    .split(/^diff --git /m)
    .filter(Boolean)
    .flatMap((fileDiff): FileDiff[] => {
      const lines = fileDiff.split("\n");
      const pathMatch = lines[0].match(/a\/(.*?) b\/(.*?)$/);
      if (!pathMatch) return [];
      const path = pathMatch[2];

      if (fileDiff.includes("Binary files")) {
        return [
          {
            path,
            oldContent: "",
            newContent: "",
            diff: fileDiff,
            additions: 0,
            deletions: 0,
            isBinary: true,
          },
        ];
      }

      let additions = 0;
      let deletions = 0;
      const oldLines: string[] = [];
      const newLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          additions++;
          newLines.push(line.substring(1));
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          deletions++;
          oldLines.push(line.substring(1));
        } else if (line.startsWith(" ")) {
          oldLines.push(line.substring(1));
          newLines.push(line.substring(1));
        }
      }

      return [
        {
          path,
          oldContent: oldLines.join("\n").trim(),
          newContent: newLines.join("\n").trim(),
          diff: fileDiff,
          additions,
          deletions,
          isBinary: false,
        },
      ];
    });
};

const STATUS_NAMES: Record<string, string> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  U: "unmerged",
};

/** `git diff --name-status` 출력 */
export const parseNameStatus = (output: string): ChangedFile[] =>
  output
    .trim()
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 2)
    .map(([code, path]) => ({ path, status: STATUS_NAMES[code] ?? code }));

/** `git diff --numstat` 출력. 바이너리는 "-"로 표시되어 0으로 센다 */
export const parseNumstat = (output: string): DiffStats => {
  const fileStats = output
    .trim()
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 3)
    .map(([added, deleted, path]) => ({
      path,
      additions: added === "-" ? 0 : Number.parseInt(added, 10),
      deletions: deleted === "-" ? 0 : Number.parseInt(deleted, 10),
    }));

  return {
    files: fileStats.length,
    additions: fileStats.reduce((sum, f) => sum + f.additions, 0),
    deletions: fileStats.reduce((sum, f) => sum + f.deletions, 0),
    fileStats,
  };
};
