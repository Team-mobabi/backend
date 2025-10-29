import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { Repo } from "./repo.entity";
import { User } from "@src/users/entities/user.entity";

export enum CollaboratorRole {
  READ = "read",
  WRITE = "write",
  ADMIN = "admin",
}

@Entity("repo_collaborators")
@Unique(["repoId", "userId"])
export class RepoCollaborator {
  @ApiProperty({
    description: "협업자 고유 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty({
    description: "Repository ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @Column()
  repoId: string;

  @ApiProperty({
    description: "협업자 User ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @Column()
  userId: string;

  @ApiProperty({
    description: "협업자 권한",
    enum: CollaboratorRole,
    example: CollaboratorRole.WRITE,
  })
  @Column({
    type: "enum",
    enum: CollaboratorRole,
    default: CollaboratorRole.READ,
  })
  role: CollaboratorRole;

  @ApiProperty({
    description: "연결된 Repository",
    type: () => Repo,
  })
  @ManyToOne(() => Repo, { onDelete: "CASCADE" })
  @JoinColumn({ name: "repoId" })
  repo: Repo;

  @ApiProperty({
    description: "협업자 User 정보",
    type: () => User,
  })
  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: "userId" })
  user?: User;

  @ApiProperty({
    description: "협업자 추가일",
    example: "2024-01-01T00:00:00.000Z",
  })
  @CreateDateColumn()
  addedAt: Date;
}