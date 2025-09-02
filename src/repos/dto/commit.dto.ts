import { IsString, Length } from "class-validator";

export class CommitDto {
  @IsString()
  @Length(1, 255)
  message: string;
}
