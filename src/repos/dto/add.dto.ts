import { IsOptional, IsArray, IsString } from "class-validator";

export class AddDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  files?: string[];
}
