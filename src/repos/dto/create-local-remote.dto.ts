import { IsString, IsOptional, Length } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class CreateLocalRemoteDto {
  @ApiPropertyOptional({
    description: "로컬 원격 저장소 이름",
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
