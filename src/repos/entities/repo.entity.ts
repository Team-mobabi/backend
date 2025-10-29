import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "@src/users/entities/user.entity";

@Entity()
export class Repo {
  @ApiProperty({
    description: "레포지토리 고유 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @PrimaryGeneratedColumn("uuid")
  repoId: string;

  @ApiProperty({
    description: "레포지토리 소유자 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @Column()
  ownerId: string;

  @ApiProperty({
    description: "레포지토리 소유자 정보",
    type: () => User,
  })
  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: "ownerId" })
  owner?: User;

  @ApiProperty({
    description: "레포지토리 이름",
    example: "my-project",
  })
  @Column({ length: 100 })
  name: string;

  @ApiProperty({
    description: "레포지토리 설명",
    example: "This is my awesome project",
    nullable: true,
  })
  @Column({ type: "text", nullable: true })
  description: string | null;

  @ApiProperty({
    description: "비공개 여부",
    example: false,
  })
  @Column({ default: false })
  isPrivate: boolean;

  @ApiProperty({
    description: "Git 저장소 경로 (deprecated, 사용자별로 동적 계산됨)",
    example: "/path/to/repo",
  })
  @Column({ length: 255, nullable: true })
  gitPath?: string;

  @ApiProperty({
    description: "Fork 출처 레포지토리 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
    nullable: true,
  })
  @Column({ type: "varchar", nullable: true })
  forkedFrom: string | null;

  @ApiProperty({
    description: "레포지토리 생성일",
    example: "2024-01-01T00:00:00.000Z",
  })
  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
