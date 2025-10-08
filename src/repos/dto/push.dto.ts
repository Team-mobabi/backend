import { IsString, IsOptional, Length } from "class-validator";
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
    description: "푸시할 브랜치 이름",
    example: "main",
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @Length(1, 100)
  branch?: string;
}
