import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class MergeBranchDto {
  @ApiProperty({
    description: "병합할 소스 브랜치",
    example: "feature/new-feature",
  })
  @IsString()
  @IsNotEmpty()
  sourceBranch: string;

  @ApiPropertyOptional({
    description: "병합 대상 브랜치 (미지정시 현재 브랜치)",
    example: "main",
  })
  @IsString()
  @IsOptional()
  targetBranch?: string;

  @ApiPropertyOptional({
    description: "Fast-forward 병합만 허용할지 여부 (현재는 3-way merge만 지원)",
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  fastForwardOnly?: boolean;
}