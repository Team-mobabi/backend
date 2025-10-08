import { IsOptional, IsString, Length } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CommitDto {
  @ApiProperty({
    description: "커밋 메시지",
    example: "feat: add new feature",
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @Length(1, 255)
  message: string;

  @ApiPropertyOptional({
    description: "커밋할 브랜치 (선택사항)",
    example: "feature/new-feature",
  })
  @IsOptional()
  @IsString()
  branch?: string;
}
