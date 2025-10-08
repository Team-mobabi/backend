import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  Length,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateRepoDto {
  @ApiProperty({
    example: "my-project",
    description: "레포지토리 이름",
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: "저장소 이름은 필수입니다." })
  @Length(3, 50, { message: "저장소 이름은 3에서 50자 사이여야 합니다." })
  name: string;

  @ApiPropertyOptional({
    example: "This is my awesome project",
    description: "레포지토리 설명",
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: false,
    description: "비공개 여부",
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean;
}
