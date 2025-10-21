import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum ResetMode {
  HARD = "hard",
  SOFT = "soft",
  MIXED = "mixed",
}

export class ResetDto {
  @ApiProperty({
    description: "되돌릴 커밋 해시",
    example: "abc1234",
  })
  @IsString()
  @IsNotEmpty()
  commitHash: string;

  @ApiPropertyOptional({
    description: "Reset 모드",
    enum: ResetMode,
    default: ResetMode.MIXED,
    example: ResetMode.HARD,
  })
  @IsEnum(ResetMode)
  @IsOptional()
  mode?: ResetMode = ResetMode.MIXED;
}