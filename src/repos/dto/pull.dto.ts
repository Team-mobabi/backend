import { IsString, IsOptional, IsBoolean, Length } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class PullDto {
  @ApiPropertyOptional({
    description: "원격 저장소 이름",
    example: "origin",
    minLength: 1,
    maxLength: 50,
    default: "origin",
  })
  @IsString()
  @IsOptional()
  @Length(1, 50)
  remote?: string;

  @ApiPropertyOptional({
    description: "Pull할 브랜치 이름 (생략 시 현재 브랜치)",
    example: "main",
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @Length(1, 100)
  branch?: string;

  @ApiPropertyOptional({
    description: "Fast-forward only 병합 (강제 fast-forward)",
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  ffOnly?: boolean;
}