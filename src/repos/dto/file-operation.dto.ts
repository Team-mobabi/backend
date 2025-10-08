import { IsOptional, IsString, IsBoolean } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class FileOperationDto {
  @ApiPropertyOptional({
    description: "파일 경로 (상대 경로)",
    example: "src/components"
  })
  @IsOptional()
  @IsString()
  path?: string;
}

export class CreateFileDto extends FileOperationDto {
  @ApiProperty({
    description: "파일명",
    example: "example.ts"
  })
  @IsString()
  filename: string;

  @ApiProperty({
    description: "파일 내용 (텍스트)",
    example: "console.log('Hello World');"
  })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description: "덮어쓰기 허용 여부",
    default: false,
    example: false
  })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean = false;
}

export class UpdateFileDto {
  @ApiProperty({
    description: "파일 경로",
    example: "src/main.ts"
  })
  @IsString()
  path: string;

  @ApiProperty({
    description: "새 파일 내용",
    example: "console.log('Updated!');"
  })
  @IsString()
  content: string;
}
