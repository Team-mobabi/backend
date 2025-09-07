import { IsString, IsOptional, IsEnum } from "class-validator";
import { ReviewStatus } from "../entities/pr-review.entity";

export class CreateReviewDto {
  @IsEnum(ReviewStatus)
  status: ReviewStatus;

  @IsOptional()
  @IsString()
  comment?: string;
}