import { IsString, IsOptional, IsEnum } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ReviewStatus } from "../entities/pr-review.entity";

export class CreateReviewDto {
  @ApiProperty({
    description: "리뷰 상태",
    enum: ReviewStatus,
    example: ReviewStatus.APPROVED,
  })
  @IsEnum(ReviewStatus)
  status: ReviewStatus;

  @ApiPropertyOptional({
    description: "리뷰 코멘트",
    example: "Looks good to me!",
  })
  @IsOptional()
  @IsString()
  comment?: string;
}
