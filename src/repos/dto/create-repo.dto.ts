import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  Length,
} from "class-validator";

export class CreateRepoDto {
  @IsString()
  @IsNotEmpty({ message: "저장소 이름은 필수입니다." })
  @Length(3, 50, { message: "저장소 이름은 3에서 50자 사이여야 합니다." })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean;
}
