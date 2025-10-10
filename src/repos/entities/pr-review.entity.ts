import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { PullRequest } from "./pull-request.entity";

export enum ReviewStatus {
  APPROVED = "approved",
  CHANGES_REQUESTED = "changes_requested",
  COMMENTED = "commented",
}

@Entity("pr_reviews")
export class PrReview {
  @ApiProperty({
    description: "리뷰 고유 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty({
    description: "Pull Request ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @Column()
  pullRequestId: string;

  @ApiProperty({
    description: "리뷰어 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @Column()
  reviewerId: string;

  @ApiProperty({
    description: "리뷰 상태",
    enum: ReviewStatus,
    example: ReviewStatus.APPROVED,
  })
  @Column({
    type: "enum",
    enum: ReviewStatus,
  })
  status: ReviewStatus;

  @ApiProperty({
    description: "리뷰 코멘트",
    example: "Looks good to me!",
    nullable: true,
  })
  @Column({ type: "text", nullable: true })
  comment: string | null;

  @ApiProperty({
    description: "연결된 Pull Request",
    type: () => PullRequest,
  })
  @ManyToOne(() => PullRequest, { onDelete: "CASCADE" })
  @JoinColumn({ name: "pullRequestId" })
  pullRequest: PullRequest;

  @ApiProperty({
    description: "리뷰 작성일",
    example: "2024-01-01T00:00:00.000Z",
  })
  @CreateDateColumn()
  createdAt: Date;
}
