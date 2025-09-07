import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { PullRequest } from "./pull-request.entity";

export enum ReviewStatus {
  APPROVED = "approved",
  CHANGES_REQUESTED = "changes_requested",
  COMMENTED = "commented",
}

@Entity("pr_reviews")
export class PrReview {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  pullRequestId: string;

  @Column()
  reviewerId: string;

  @Column({
    type: "enum",
    enum: ReviewStatus,
  })
  status: ReviewStatus;

  @Column({ type: "text", nullable: true })
  comment: string | null;

  @ManyToOne(() => PullRequest)
  @JoinColumn({ name: "pullRequestId" })
  pullRequest: PullRequest;

  @CreateDateColumn()
  createdAt: Date;
}