import { IsString, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreatePullRequestDto {
  @ApiProperty({
    description: "Pull Request 제목",
    example: "Add new feature",
  })
  @IsString()
  title: string;

  @ApiPropertyOptional({
    description: "Pull Request 설명",
    example: "This PR adds a new authentication feature",
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: "소스 브랜치 (병합할 브랜치)",
    example: "feature/new-feature",
  })
  @IsString()
  sourceBranch: string;

  @ApiProperty({
    description: "타겟 브랜치 (병합 대상 브랜치)",
    example: "main",
  })
  @IsString()
  targetBranch: string;
}
