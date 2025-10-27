import { IsString, IsOptional, Length, IsBoolean } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class PushDto {
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
    description: "푸시할 브랜치 이름 (생략 시 현재 브랜치)",
    example: "main",
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @Length(1, 100)
  branch?: string;

  @ApiPropertyOptional({
    description: "강제 푸시 여부 (원격 커밋 덮어쓰기)",
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}
