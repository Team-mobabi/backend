import { IsString, IsOptional } from "class-validator";

export class CreatePullRequestDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  sourceBranch: string;

  @IsString()
  targetBranch: string;
}