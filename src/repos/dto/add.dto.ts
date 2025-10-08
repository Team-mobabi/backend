import { IsOptional, IsArray, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class AddDto {
  @ApiPropertyOptional({
    description: "스테이징할 파일 목록. 비어있으면 모든 변경사항을 스테이징",
    type: [String],
    example: ["src/main.ts", "README.md"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  files?: string[];
}
