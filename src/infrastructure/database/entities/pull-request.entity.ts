import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { Repo } from "./repo.entity";

export enum PullRequestStatus {
  OPEN = "open",
  MERGED = "merged",
  CLOSED = "closed",
}

@Entity("pull_requests")
export class PullRequest {
  @ApiProperty({
    description: "Pull Request 고유 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty({
    description: "Pull Request 제목",
    example: "Add new feature",
  })
  @Column()
  title: string;

  @ApiProperty({
    description: "Pull Request 설명",
    example: "This PR adds a new authentication feature",
    nullable: true,
  })
  @Column({ type: "text", nullable: true })
  description: string | null;

  @ApiProperty({
    description: "소스 브랜치",
    example: "feature/new-feature",
  })
  @Column()
  sourceBranch: string;

  @ApiProperty({
    description: "타겟 브랜치",
    example: "main",
  })
  @Column()
  targetBranch: string;

  @ApiProperty({
    description: "작성자 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @Column()
  authorId: string;

  @ApiProperty({
    description: "Pull Request 상태",
    enum: PullRequestStatus,
    example: PullRequestStatus.OPEN,
  })
  @Column({
    type: "enum",
    enum: PullRequestStatus,
    default: PullRequestStatus.OPEN,
  })
  status: PullRequestStatus;

  @ApiProperty({
    description: "병합 일시",
    example: "2024-01-01T00:00:00.000Z",
    nullable: true,
  })
  @Column({ type: "timestamp", nullable: true })
  mergedAt: Date | null;

  @ApiProperty({
    description: "병합한 사용자 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
    nullable: true,
  })
  @Column({ type: "varchar", nullable: true })
  mergedBy: string | null;

  @ApiProperty({
    description: "병합 커밋 해시",
    example: "a1b2c3d4e5f6",
    nullable: true,
  })
  @Column({ type: "varchar", nullable: true })
  mergeCommitHash: string | null;

  @ApiProperty({
    description: "승인 필요 여부",
    example: true,
  })
  @Column({ default: true })
  requiresApproval: boolean;

  @ApiProperty({
    description: "레포지토리 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @Column()
  repoId: string;

  @ApiProperty({
    description: "연결된 레포지토리",
    type: () => Repo,
  })
  @ManyToOne(() => Repo, { onDelete: "CASCADE" })
  @JoinColumn({ name: "repoId" })
  repo: Repo;

  @ApiProperty({
    description: "생성일",
    example: "2024-01-01T00:00:00.000Z",
  })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({
    description: "수정일",
    example: "2024-01-01T00:00:00.000Z",
  })
  @UpdateDateColumn()
  updatedAt: Date;
}
