import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Repo } from "./repo.entity";

export enum PullRequestStatus {
  OPEN = "open",
  MERGED = "merged",
  CLOSED = "closed",
}

@Entity("pull_requests")
export class PullRequest {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  title: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column()
  sourceBranch: string;

  @Column()
  targetBranch: string;

  @Column()
  authorId: string;

  @Column({
    type: "enum",
    enum: PullRequestStatus,
    default: PullRequestStatus.OPEN,
  })
  status: PullRequestStatus;

  @Column({ type: "timestamp", nullable: true })
  mergedAt: Date | null;

  @Column({ type: "varchar", nullable: true })
  mergedBy: string | null;

  @Column({ type: "varchar", nullable: true })
  mergeCommitHash: string | null;

  @Column({ default: true })
  requiresApproval: boolean;

  @Column()
  repoId: string;

  @ManyToOne(() => Repo)
  @JoinColumn({ name: "repoId" })
  repo: Repo;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}