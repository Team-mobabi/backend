import { IsString, IsOptional, IsBoolean } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ForkRepoDto {
  @ApiProperty({
    description: "Fork할 레포지토리 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @IsString()
  sourceRepoId: string;

  @ApiPropertyOptional({
    description: "Fork된 레포지토리 이름 (기본값: 원본 이름)",
    example: "my-forked-project",
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: "비공개 여부",
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}