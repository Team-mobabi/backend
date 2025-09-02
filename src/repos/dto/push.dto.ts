import { IsString, IsOptional, Length } from "class-validator";

export class PushDto {
  @IsString()
  @IsOptional()
  @Length(1, 50)
  remote?: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  branch?: string;
}
