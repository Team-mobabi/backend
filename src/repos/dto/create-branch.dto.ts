import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateBranchDto {
  @ApiProperty({
    description: "생성할 브랜치 이름",
    example: "feature/new-feature",
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: "기준이 되는 브랜치 (미지정시 현재 브랜치 기준)",
    example: "main",
  })
  @IsString()
  @IsOptional()
  from?: string;
}