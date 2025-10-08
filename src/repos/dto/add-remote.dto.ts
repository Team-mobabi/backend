import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Length,
  IsUrl,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AddRemoteDto {
  @ApiProperty({
    description: "원격 저장소 URL",
    example: "https://github.com/user/repo.git",
  })
  @IsUrl({}, { message: "유효한 URL 형식이 아닙니다." })
  @IsNotEmpty({ message: "원격 저장소 URL은 필수입니다." })
  url: string;

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
  name?: string;
}
