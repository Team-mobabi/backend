import { ApiProperty } from "@nestjs/swagger";

/**
 * 브랜치 병합 응답
 */
export class MergeResponse {
  @ApiProperty({
    description: "병합 성공 여부",
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: "Fast-forward 병합 여부",
    example: false,
  })
  fastForward: boolean;

  @ApiProperty({
    description: "병합 전 커밋 해시",
    example: "abc1234",
  })
  from: string;

  @ApiProperty({
    description: "병합 후 커밋 해시",
    example: "def5678",
  })
  to: string;

  @ApiProperty({
    description: "소스 브랜치 이름",
    example: "feature/new-feature",
  })
  sourceBranch: string;

  @ApiProperty({
    description: "타겟 브랜치 이름",
    example: "main",
  })
  targetBranch: string;

  @ApiProperty({
    description: "충돌 발생 여부",
    example: false,
  })
  hasConflict: boolean;

  @ApiProperty({
    description: "충돌이 발생한 파일 목록",
    example: ["file1.txt", "file2.js"],
    type: [String],
  })
  conflictFiles: string[];
}

/**
 * Pull 응답
 */
export class PullResponse {
  @ApiProperty({
    description: "Pull 성공 여부",
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: "Fast-forward 병합 여부",
    example: true,
  })
  fastForward: boolean;

  @ApiProperty({
    description: "Pull 전 로컬 커밋 해시",
    example: "abc1234",
  })
  from: string;

  @ApiProperty({
    description: "Pull 후 커밋 해시",
    example: "def5678",
  })
  to: string;

  @ApiProperty({
    description: "충돌 발생 여부",
    example: false,
  })
  hasConflict: boolean;

  @ApiProperty({
    description: "충돌이 발생한 파일 목록",
    example: [],
    type: [String],
  })
  conflictFiles: string[];
}

/**
 * Push 응답
 */
export class PushResponse {
  @ApiProperty({
    description: "Push 성공 여부",
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: "이미 최신 상태인지 여부",
    example: false,
  })
  upToDate: boolean;

  @ApiProperty({
    description: "Push된 브랜치 정보",
    example: [],
    type: [Object],
  })
  pushed: any[];
}
